import { knowledgeEmbedText, validateKnowledge } from '../chat/knowledge-format';
import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  CHATBOT_FILTER, ChatbotUserService, ChatbotUserServiceDocument, UserServiceStatus, UserServiceType,
} from '../userservices/schemas/userservice.schema';
import { CHATBOT_FIELD_PATHS, ChatbotView, TEMPLATE_TO_SERVICE_SLUG, toChatbotView } from '../userservices/chatbot-view';
import { KnowledgeBase, KnowledgeBaseDocument } from './schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyProvider } from '../api-keys/schemas/api-key.schema';
import { embeddingProviderFor, getEmbeddingVector, isChatCapableProvider, listChatModels } from '../api-keys/ai-provider.util';
import { BillingService } from '../billing/billing.service';
import { BillingStatus, BillingType } from '../billing/schemas/billing.schema';
import { EmailService } from '../email/email.service';
import { ServicesService } from '../services/services.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

// Fields the chatbot's own owner is allowed to change via PUT /chatbots/:id.
// Deliberately excludes `billing` and `embedKey` — those are admin-only /
// system-generated and must never be settable by the customer themselves.
const CUSTOMER_EDITABLE_FIELDS = [
  'name',
  'description',
  'persona',
  'bookingUrl',
  'language',
  'status',
  'fallbackMessage',
  'fallbackMessage_ar',
  'humanHandoff',
  'channels',
  'outlets',
  'chatModelConfig',
];

function pickCustomerEditable(dto: any): any {
  const out: any = {};
  for (const key of CUSTOMER_EDITABLE_FIELDS) {
    if (dto[key] !== undefined) out[key] = dto[key];
  }
  return out;
}

@Injectable()
export class ChatbotsService {
  private readonly logger = new Logger(ChatbotsService.name);

  constructor(
    @InjectModel(ChatbotUserService.name) private chatbotModel: Model<ChatbotUserServiceDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel('User') private userModel: Model<any>,
    private apiKeysService: ApiKeysService,
    private billingService: BillingService,
    private emailService: EmailService,
    private servicesService: ServicesService,
    private activityLogsService: ActivityLogsService,
  ) {}

  // Every new chatbot starts a 30-day free trial automatically — no admin
  // step required. If `dto.moduleSlug` is set (the marketing detail page's
  // pricing section passes it), the chatbot inherits that template's tier
  // pricing (`module.pricingTiers`, see backend CLAUDE.md's "Tiered chatbot
  // pricing" section) as its billed rate. `dto.tier` selects which one —
  // only 'basic'/'pro' are ever accepted here since 'custom' is a
  // Contact-Us-only tier with no self-serve purchase flow (the frontend's
  // Custom card is a mailto link, never a POST to this route); anything
  // else defaults to 'basic', the safest/cheapest tier. Omitting moduleSlug
  // entirely keeps the hand-negotiated-deal flow (dashboard's own
  // "+ New Chatbot" modal): admin sets pricing/tier later via PUT /:id/pricing.
  async create(userId: string, dto: any, actor?: { id: string; role: 'user' | 'admin' }): Promise<ChatbotView> {
    const { moduleSlug, tier: requestedTier, template, ...rest } = dto;

    // Every chatbot is a subscription to a real catalog service (no blank
    // "custom" bots): the marketing page / Browse Services send moduleSlug,
    // the admin's "build for a client" form sends template.
    const slug = moduleSlug || (template ? TEMPLATE_TO_SERVICE_SLUG[template] : undefined);
    if (!slug) throw new BadRequestException('Choose which chatbot service to start.');
    let service: any;
    try {
      service = await this.servicesService.findOne(slug);
    } catch {
      throw new BadRequestException('That chatbot service does not exist.');
    }
    if (service.type !== 'chatbot') throw new BadRequestException('That service is not a chatbot.');

    const wanted = requestedTier === 'pro' ? 'pro' : 'basic';
    const tierPricing = service.pricing?.tiers?.find((t: any) => t.key === wanted);
    const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const settings: Record<string, any> = {};
    for (const key of Object.keys(pickCustomerEditable(rest))) {
      if (key === 'name' || key === 'status') continue;
      settings[CHATBOT_FIELD_PATHS[key].replace('config.', '')] = rest[key];
    }

    const created = await this.chatbotModel.create({
      userId: new Types.ObjectId(userId),
      type: UserServiceType.CHATBOT,
      serviceId: service._id,
      name: (rest.name || '').trim() || service.name,
      status: UserServiceStatus.TRIAL,
      trialEndDate,
      plan: {
        tier: tierPricing ? wanted : 'basic',
        monthlyFee: tierPricing?.monthly ?? service.pricing?.monthly ?? 0,
        setupFee: 0,
        currency: 'USD',
      },
      config: { ...settings, embedKey: crypto.randomBytes(16).toString('hex') },
    });
    const chatbot = toChatbotView({ ...created.toObject(), serviceId: { _id: service._id, slug } });
    const billing = { trialEndsAt: trialEndDate };

    try {
      const user = await this.userModel.findById(userId).lean();
      if (user) {
        await this.emailService.sendTrialStartedEmail(
          { name: (user as any).name, email: (user as any).email },
          { moduleName: chatbot.name, trialEndDate: billing.trialEndsAt },
        );
        // Setup-guide email always goes to the bot's actual owner, not the
        // caller — matters when an admin creates this chatbot on a client's
        // behalf (see the isAdmin flow), where the caller and owner differ.
        await this.emailService.sendChatbotSetupGuideEmail(
          { name: (user as any).name, email: (user as any).email },
          { chatbotName: chatbot.name },
        );
      }
    } catch (err) {
      this.logger.warn(`create() onboarding email(s) failed for chatbot=${chatbot._id}: ${err?.message}`);
    }

    await this.activityLogsService.record({
      userId, actorId: actor?.id || userId,
      actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.CREATE, entityType: 'chatbot', entityId: (chatbot._id as Types.ObjectId).toString(),
      changes: { after: { name: chatbot.name, template: chatbot.template } },
      description: `Chatbot "${chatbot.name}" created`,
    });

    return chatbot;
  }

  // Template key → service id, for the dashboard's ?template= filters.
  private async serviceIdForTemplate(template?: string): Promise<Types.ObjectId | null> {
    const slug = template ? TEMPLATE_TO_SERVICE_SLUG[template] : undefined;
    if (!slug) return null;
    try {
      return (await this.servicesService.findOne(slug))._id as Types.ObjectId;
    } catch {
      return null;
    }
  }

  async findAllByUser(userId: string, template?: string): Promise<ChatbotView[]> {
    const filter: any = { ...CHATBOT_FILTER, userId: new Types.ObjectId(userId), isDeleted: false };
    if (template) filter.serviceId = await this.serviceIdForTemplate(template);
    const rows = await this.chatbotModel.find(filter).populate('serviceId', 'slug').sort({ createdAt: -1 }).lean();
    return rows.map((r) => toChatbotView(r));
  }

  async findOneView(id: string, userId: string, isAdmin = false): Promise<ChatbotView> {
    return toChatbotView(await this.findOne(id, userId, isAdmin), isAdmin);
  }

  // isAdmin bypasses the ownership check — lets an admin view/manage a
  // client's chatbot through the same routes the client themselves uses
  // (onboarding a client after a deal closes, or helping with support),
  // without duplicating every method for an admin-only variant.
  async findOne(id: string, userId: string, isAdmin = false): Promise<ChatbotUserServiceDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Chatbot not found');
    const chatbot = await this.chatbotModel.findOne({ _id: id, ...CHATBOT_FILTER, isDeleted: false }).populate('serviceId', 'slug');
    if (!chatbot) throw new NotFoundException('Chatbot not found');
    if (!isAdmin && chatbot.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    return chatbot;
  }

  // Admin-only lookup — no ownership check. Only ever call this from a route
  // that has already verified req.user.role === 'admin'.
  async findOneAdmin(id: string): Promise<ChatbotUserServiceDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Chatbot not found');
    const chatbot = await this.chatbotModel.findOne({ _id: id, ...CHATBOT_FILTER, isDeleted: false }).populate('serviceId', 'slug');
    if (!chatbot) throw new NotFoundException('Chatbot not found');
    return chatbot;
  }

  // Admin-only — every customer's chatbot, with owner name/email populated
  // so admin can tell whose bot they're pricing. Also computes a
  // "needs setup" flag per bot — see the onboarding model in CLAUDE.md
  // (client is hands-off, admin does WhatsApp/Instagram/OpenAI-key setup):
  // this is the queue view for that, so an admin managing many clients
  // doesn't have to remember or dig through each bot's tabs to see who's
  // still waiting. Flags are:
  //   - noOpenAiKey: bot owner has no active OpenAI key on file at all
  //   - whatsappPending: owner enabled WhatsApp but never got credentials
  //   - instagramPending: same, for Instagram
  // Batched into 2 queries total (bots + one api-key existence check),
  // not one per bot, so this stays cheap as the list grows.
  async findAllAdmin(template?: string): Promise<any[]> {
    const filter: any = { ...CHATBOT_FILTER, isDeleted: false };
    if (template) filter.serviceId = await this.serviceIdForTemplate(template);
    const rows = await this.chatbotModel
      .find(filter)
      .populate('userId', 'name email')
      .populate('serviceId', 'slug')
      .sort({ createdAt: -1 })
      .lean();
    const bots: any[] = rows.map((r) => toChatbotView(r, true));

    const ownerIds = [...new Set(
      bots.map((b) => (b.userId as any)?._id?.toString()).filter(Boolean),
    )];

    // "Needs setup" has to reflect whichever provider each bot is actually
    // configured for (chatModelConfig defaults to OpenAI, but may be
    // Anthropic/Gemini) — not a blanket OpenAI check.
    // A bot fully set up on Claude should never show as "needs setup" just
    // because its owner has no OpenAI key.
    const providersInUse = [...new Set(
      bots.flatMap((b: any) => [
        b.chatModelConfig?.provider || ApiKeyProvider.OPENAI,
      ]),
    )] as ApiKeyProvider[];
    const keysByProvider = new Map<ApiKeyProvider, Set<string>>();
    await Promise.all(
      providersInUse.map(async (provider) => {
        keysByProvider.set(provider, await this.apiKeysService.getUserIdsWithActiveKey(ownerIds, provider));
      }),
    );

    // Per-tenant usage — message volume, not just global aggregate stats.
    // Two aggregate queries across the whole Conversation collection
    // (grouped by chatbotId), not one query per bot — same "batched, not
    // N+1" rule getUserIdsWithActiveKey already follows above, so this
    // list stays a fixed number of queries regardless of how many
    // chatbots exist.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [allTimeStats, recentStats] = await Promise.all([
      this.conversationModel.aggregate([
        {
          $group: {
            _id: '$userserviceId',
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: { $ifNull: ['$messages', []] } } },
          },
        },
      ]),
      this.conversationModel.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: '$userserviceId',
            conversations30d: { $sum: 1 },
            messages30d: { $sum: { $size: { $ifNull: ['$messages', []] } } },
          },
        },
      ]),
    ]);
    const allTimeByBot = new Map(allTimeStats.map((s) => [String(s._id), s]));
    const recentByBot = new Map(recentStats.map((s) => [String(s._id), s]));

    return bots.map((b: any) => {
      const ownerId = (b.userId as any)?._id?.toString();
      const botId = String(b._id);
      const chatProvider = b.chatModelConfig?.provider || ApiKeyProvider.OPENAI;
      // Field name kept as noOpenAiKey for frontend compatibility — it means
      // "no key on file for this bot's AI provider" (one provider covers
      // both replies and knowledge-base embeddings).
      const noOpenAiKey = !ownerId || !keysByProvider.get(chatProvider)?.has(ownerId);
      const whatsappPending = !!b.channels?.whatsapp?.enabled && !b.channels?.whatsapp?.phoneNumberId;
      const instagramPending = !!b.channels?.instagram?.enabled && !b.channels?.instagram?.accountId;
      const allTime = allTimeByBot.get(botId);
      const recent = recentByBot.get(botId);
      return {
        ...b,
        setupFlags: { noOpenAiKey, whatsappPending, instagramPending },
        needsSetup: noOpenAiKey || whatsappPending || instagramPending,
        usage: {
          totalConversations: allTime?.totalConversations || 0,
          totalMessages: allTime?.totalMessages || 0,
          conversations30d: recent?.conversations30d || 0,
          messages30d: recent?.messages30d || 0,
        },
      };
    });
  }

  // One plan, everything included — same story as agents/automations. No
  // per-tier channel gating: once subscribed, a chatbot owner can enable
  // website/WhatsApp/Instagram freely.
  async update(id: string, userId: string, dto: any, isAdmin = false): Promise<ChatbotView> {
    const chatbot = await this.findOne(id, userId, isAdmin);
    const changes = pickCustomerEditable(dto);
    const embeddingBefore = embeddingProviderFor(chatbot.config.chatModelConfig?.provider || ApiKeyProvider.OPENAI);

    // Setup/exploration stays open to an unverified account — only going
    // live is gated. Deliberately not a full account lock/deadline: that
    // would punish anyone still mid-setup for a slow inbox, and the
    // verification link itself already expires in 24h (see
    // AuthService.register()) with a one-click resend, so there's already
    // a natural forcing function without adding a second one here.
    if (changes.status === 'active' && chatbot.config.botStatus !== 'active') {
      const owner = await this.userModel.findById(chatbot.userId).select('auth.isEmailVerified').lean();
      if (!owner || !(owner as any).auth?.isEmailVerified) {
        throw new BadRequestException(
          isAdmin
            ? 'This chatbot\'s owner needs to verify their email before it can go live.'
            : 'Verify your email before making this chatbot live.',
        );
      }
    }

    // Tier gate — WhatsApp/Instagram are Pro+ features (see backend
    // CLAUDE.md's "Tiered chatbot pricing"). The config page's UI already
    // replaces these toggles with a locked upgrade prompt on Basic, so this
    // is defense-in-depth against a direct API call bypassing that, not
    // the primary UX — hence a clear error rather than a silent strip.
    if (chatbot.plan?.tier === 'basic') {
      if (changes.channels?.whatsapp?.enabled === true) {
        throw new ForbiddenException('WhatsApp integration requires the Pro plan. Upgrade to enable it.');
      }
      if (changes.channels?.instagram?.enabled === true) {
        throw new ForbiddenException('Instagram integration requires the Pro plan. Upgrade to enable it.');
      }
    }

    for (const [key, value] of Object.entries(changes)) chatbot.set(CHATBOT_FIELD_PATHS[key], value);
    // Every bot gets its own random webhook verify token per Meta channel,
    // so the handshake can't be completed by anyone who just guesses a URL.
    for (const ch of ['whatsapp', 'instagram'] as const) {
      const cfg: any = chatbot.config.channels?.[ch];
      if (cfg && !cfg.verifyToken) cfg.verifyToken = crypto.randomBytes(16).toString('hex');
    }
    const saved = await chatbot.save();

    // Switching provider changes the embedding space: vectors from the old
    // provider can't be compared with the new one's, so re-embed the
    // knowledge base in the background (entries left without a vector are
    // still found by word matching meanwhile).
    const embeddingAfter = embeddingProviderFor(saved.config.chatModelConfig?.provider || ApiKeyProvider.OPENAI);
    if (embeddingAfter !== embeddingBefore) {
      this.reembedKnowledge(saved).catch((err) =>
        this.logger.warn(`Re-embedding knowledge for ${saved._id} failed: ${err?.message || err}`),
      );
    }

    // `changes` can include `channels` (plaintext WhatsApp/Instagram access
    // tokens — never encrypted the way ApiKey.encryptedKey is). Logging the
    // field *names* that changed, never their values, is enough to be
    // useful and keeps no secret anywhere near activity_logs (see
    // ai/rules.md #10 — the caller picks exactly what's safe to log).
    await this.activityLogsService.record({
      userId: chatbot.userId.toString(), actorId: userId,
      actorRole: isAdmin ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.UPDATE, entityType: 'chatbot', entityId: (chatbot._id as Types.ObjectId).toString(),
      changes: { after: { fieldsChanged: Object.keys(changes) } },
      description: `Chatbot "${chatbot.name}" updated (${Object.keys(changes).join(', ')})`,
    });

    return toChatbotView(saved, isAdmin);
  }

  async delete(id: string, userId: string, isAdmin = false): Promise<{ message: string }> {
    const chatbot = await this.findOne(id, userId, isAdmin);
    const chatbotId = chatbot._id as Types.ObjectId;
    const template = toChatbotView(chatbot).template;
    await Promise.all([
      this.chatbotModel.deleteOne({ _id: chatbotId, ...CHATBOT_FILTER }),
      this.knowledgeBaseModel.deleteMany({ userserviceId: chatbotId }),
      this.conversationModel.deleteMany({ userserviceId: chatbotId }),
    ]);

    await this.activityLogsService.record({
      userId: chatbot.userId.toString(), actorId: userId,
      actorRole: isAdmin ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.DELETE, entityType: 'chatbot', entityId: chatbotId.toString(),
      changes: { before: { name: chatbot.name, template } },
      description: `Chatbot "${chatbot.name}" deleted`,
    });

    return { message: 'Chatbot deleted' };
  }

  // Embeds with the provider the bot is set to (its one AI provider) and the
  // owner's BYOK key for it — never the caller's key, so an admin embedding
  // knowledge on a client's behalf still bills the client. No platform-wide
  // fallback. null means no embedding: an Anthropic bot (no embeddings API)
  // or no key on file; the entry is then found by word matching.
  private async resolveEmbedding(chatbot: ChatbotUserServiceDocument, text: string): Promise<number[] | null> {
    const provider = embeddingProviderFor(chatbot.config.chatModelConfig?.provider || ApiKeyProvider.OPENAI);
    if (!provider) return null;
    let apiKey: string;
    try {
      apiKey = await this.apiKeysService.getDecryptedKey(chatbot.userId.toString(), provider);
    } catch {
      return null;
    }
    return getEmbeddingVector({ provider, apiKey, text });
  }

  private async reembedKnowledge(chatbot: ChatbotUserServiceDocument): Promise<void> {
    const entries = await this.knowledgeBaseModel.find({ userserviceId: chatbot._id });
    for (const entry of entries) {
      const text = knowledgeEmbedText(entry as any);
      let vector: number[] | null = null;
      try {
        vector = text ? await this.resolveEmbedding(chatbot, text) : null;
      } catch {
        vector = null;
      }
      await this.knowledgeBaseModel.updateOne({ _id: entry._id }, { $set: { embedding: vector || [] } });
    }
  }

  // Chat models the bot owner's key can use for a provider, for the model
  // picker on the Overview tab. "auto" is always offered by the frontend.
  async listModels(id: string, userId: string, provider: string, isAdmin = false) {
    const chatbot = await this.findOne(id, userId, isAdmin);
    if (!isChatCapableProvider(provider as ApiKeyProvider)) throw new BadRequestException('Unknown AI provider.');
    let apiKey: string;
    try {
      apiKey = await this.apiKeysService.getDecryptedKey(chatbot.userId.toString(), provider);
    } catch {
      return { provider, keyMissing: true, models: [] };
    }
    try {
      return { provider, keyMissing: false, models: await listChatModels(provider as ApiKeyProvider, apiKey) };
    } catch (err: any) {
      this.logger.warn(`Listing ${provider} models failed: ${err?.message || err}`);
      return { provider, keyMissing: false, models: [], error: 'Could not load models from the provider — check the API key.' };
    }
  }

  async addKnowledge(chatbotId: string, userId: string, dto: any, isAdmin = false): Promise<KnowledgeBaseDocument> {
    // Verify ownership (or admin access)
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);

    const fields = pickKnowledgeFields(dto);
    const invalid = validateKnowledge(fields);
    if (invalid) throw new BadRequestException(invalid);

    let embedding: number[] = [];

    try {
      // Always embeds with the bot OWNER's key + configured provider (BYOK)
      // — an admin adding knowledge on a client's behalf still bills the
      // client's own key, never a platform-wide fallback.
      const textToEmbed = knowledgeEmbedText(fields);

      if (textToEmbed) {
        const vector = await this.resolveEmbedding(chatbot, textToEmbed);
        if (!vector) throw new Error('No API key available for embedding provider');
        embedding = vector;
      }
    } catch (err) {
      // No API key or embedding failed — store without embedding
      this.logger.warn(`addKnowledge() embedding skipped for chatbot=${chatbotId}: ${err?.message}`);
      embedding = [];
    }

    const entry = await this.knowledgeBaseModel.create({
      ...fields,
      userserviceId: new Types.ObjectId(chatbotId),
      embedding,
    });

    await this.activityLogsService.record({
      userId: chatbot.userId.toString(), actorId: userId,
      actorRole: isAdmin ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.CREATE, entityType: 'knowledge_base', entityId: (entry._id as Types.ObjectId).toString(),
      changes: { after: { type: dto.type } },
      description: `Knowledge base entry added to "${chatbot.name}"`,
    });

    return entry;
  }

  // Edits an existing entry in place and re-embeds it, since the text
  // changed — same BYOK key resolution as addKnowledge (the bot owner's
  // key, never the caller's, so an admin editing a client's entry still
  // bills the client, not themselves). Added specifically so a knowledge
  // update can be demoed live (edit -> ask the widget the same question ->
  // see the new answer) instead of the previous delete-then-recreate
  // workaround, which had no edit route at all.
  async updateKnowledge(
    chatbotId: string,
    knowledgeId: string,
    userId: string,
    dto: any,
    isAdmin = false,
  ): Promise<KnowledgeBaseDocument> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);

    const entry = await this.knowledgeBaseModel.findOne({
      _id: new Types.ObjectId(knowledgeId),
      userserviceId: new Types.ObjectId(chatbotId),
    });
    if (!entry) throw new NotFoundException('Knowledge entry not found');

    const changes = pickKnowledgeFields(dto);
    for (const [key, value] of Object.entries(changes)) (entry as any)[key] = value;
    const invalid = validateKnowledge(entry);
    if (invalid) throw new BadRequestException(invalid);

    try {
      const textToEmbed = knowledgeEmbedText(entry);
      if (textToEmbed) {
        const vector = await this.resolveEmbedding(chatbot, textToEmbed);
        if (!vector) throw new Error('No API key available for embedding provider');
        entry.embedding = vector;
      }
    } catch (err) {
      this.logger.warn(`updateKnowledge() re-embedding skipped for chatbot=${chatbotId}: ${err?.message}`);
    }

    const saved = await entry.save();

    await this.activityLogsService.record({
      userId: chatbot.userId.toString(), actorId: userId,
      actorRole: isAdmin ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.UPDATE, entityType: 'knowledge_base', entityId: (entry._id as Types.ObjectId).toString(),
      changes: { after: { fieldsChanged: Object.keys(dto) } },
      description: `Knowledge base entry updated on "${chatbot.name}"`,
    });

    return saved;
  }

  async listKnowledge(chatbotId: string, userId: string, isAdmin = false): Promise<KnowledgeBaseDocument[]> {
    await this.findOne(chatbotId, userId, isAdmin);
    return this.knowledgeBaseModel
      .find({ userserviceId: new Types.ObjectId(chatbotId) })
      .select('-embedding')
      .sort({ createdAt: -1 });
  }

  async deleteKnowledge(chatbotId: string, knowledgeId: string, userId: string, isAdmin = false): Promise<{ message: string }> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);
    const result = await this.knowledgeBaseModel.findOneAndDelete({
      _id: new Types.ObjectId(knowledgeId),
      userserviceId: new Types.ObjectId(chatbotId),
    });
    if (!result) throw new NotFoundException('Knowledge entry not found');

    await this.activityLogsService.record({
      userId: chatbot.userId.toString(), actorId: userId,
      actorRole: isAdmin ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.DELETE, entityType: 'knowledge_base', entityId: knowledgeId,
      changes: { before: { type: result.type } },
      description: `Knowledge base entry removed from "${chatbot.name}"`,
    });

    return { message: 'Knowledge entry deleted' };
  }

  async getConversations(chatbotId: string, userId: string, limit = 20, isAdmin = false): Promise<ConversationDocument[]> {
    await this.findOne(chatbotId, userId, isAdmin);
    return this.conversationModel
      .find({ userserviceId: new Types.ObjectId(chatbotId) })
      .sort({ createdAt: -1 })
      .limit(Number(limit));
  }

  async getAnalytics(chatbotId: string, userId: string, isAdmin = false): Promise<any> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);

    // Analytics is a Pro+ feature — the config page hides this tab entirely
    // for Basic, this is the server-side backstop for a direct API call.
    if (chatbot.plan?.tier === 'basic') {
      throw new ForbiddenException('Analytics requires the Pro plan. Upgrade to unlock it.');
    }

    const conversations = await this.conversationModel.find({
      userserviceId: new Types.ObjectId(chatbotId),
    });

    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
    const avgMessagesPerConversation = totalConversations
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;
    const handoffs = conversations.filter((c) => c.status === 'handoff').length;

    const byChannel: Record<string, number> = { website: 0, whatsapp: 0, instagram: 0 };
    for (const c of conversations) {
      byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    }

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation,
      handoffs,
      byChannel,
    };
  }

  // A single self-closing <script> tag with only data-* attributes — no
  // inline JS body, no object literal, no curly braces at all. That's
  // deliberate: a customer pastes this exactly as copied into their site's
  // <head>, and because there's no text content for the tag to carry, it's
  // valid as-is in plain HTML *and* as a literal JSX/Vue-template element —
  // the previous `<script>window.LMChatbot = {...}</script>` form needed
  // dangerouslySetInnerHTML (or an equivalent) to paste into a Next.js/
  // React/Vue codebase, since those frameworks don't execute inline
  // <script> text the way a browser parsing raw HTML does. color/botName
  // are included only as an instant-paint fallback before the widget's own
  // live-config fetch (GET /chat/:embedKey/config) resolves — embedKey and
  // the script's own src are the only two values this snippet must carry.
  async getEmbedCode(chatbotId: string, userId: string, isAdmin = false): Promise<{ embedCode: string }> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);
    const color = chatbot.config.channels?.website?.customColor || '#7c3aed';
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.logicmate.io';
    const backendUrl = process.env.PUBLIC_API_URL || process.env.BACKEND_URL || 'https://www.logicmate.io';
    const apiUrl = `${backendUrl.replace(/\/$/, '')}/api/v1`;
    const embedCode = `<!-- LogicMate Chatbot Widget — paste exactly as copied into your site's <head>. Works as-is on any platform, including Next.js/React/Vue. -->
<script
  src="${frontendUrl}/chatbot-widget.js"
  data-embed-key="${chatbot.config.embedKey}"
  data-api-url="${apiUrl}"
  data-color="${color}"
  async
></script>`;
    return { embedCode };
  }

  // ── Pricing & billing (admin-set, manual bank-transfer payment) ────────

  // Admin only — sets what this specific chatbot costs. No fixed public
  // tiers yet: every deal is priced by hand until real patterns emerge.
  async updatePricing(
    id: string,
    dto: { setupFee?: number; monthlyFee?: number; currency?: string; trialEndsAt?: string; notes?: string; tier?: 'basic' | 'pro' | 'custom' },
  ): Promise<ChatbotView> {
    const chatbot = await this.findOneAdmin(id);

    if (dto.setupFee !== undefined) chatbot.set('plan.setupFee', dto.setupFee);
    if (dto.monthlyFee !== undefined) chatbot.set('plan.monthlyFee', dto.monthlyFee);
    if (dto.currency !== undefined) chatbot.set('plan.currency', dto.currency);
    if (dto.tier !== undefined) chatbot.set('plan.tier', dto.tier);
    if (dto.trialEndsAt !== undefined) chatbot.trialEndDate = new Date(dto.trialEndsAt);
    if (dto.notes !== undefined) chatbot.adminNotes = dto.notes;

    // A setup fee on a trial bot means it now owes that payment: it stops
    // answering (past_due) until an admin confirms the setup payment.
    // Changing only the tier or the monthly price never ends the trial.
    if (chatbot.status === UserServiceStatus.TRIAL && dto.setupFee !== undefined && dto.setupFee > 0) {
      chatbot.status = UserServiceStatus.PAST_DUE;
    }

    return toChatbotView(await chatbot.save(), true);
  }

  // Best-effort lookup of this chatbot's template's Pro-tier monthly price,
  // via its services doc's pricingTiers (see backend CLAUDE.md's "Tiered
  // chatbot pricing" section). Returns null if the template has no known
  // module mapping (e.g. 'custom') or the module/pricingTiers can't be
  // found — callers fall back to leaving monthlyFee untouched rather than
  // guessing, same defensive pattern create() already uses for moduleSlug.
  private async resolveProMonthlyPrice(chatbot: ChatbotUserServiceDocument): Promise<number | null> {
    const serviceId: any = chatbot.serviceId;
    const slug = serviceId?.slug || (serviceId ? String(serviceId) : undefined);
    if (!slug) return null;
    try {
      const module = await this.servicesService.findOne(slug);
      const proTier = module.pricing?.tiers?.find((t: any) => t.key === 'pro');
      return proTier?.monthly ?? null;
    } catch (err) {
      this.logger.warn(`resolveProMonthlyPrice() couldn't load module "${slug}": ${err?.message}`);
      return null;
    }
  }

  // Customer calls this after making the bank transfer — or, for
  // kind:'upgrade', after deciding they want Pro (see backend CLAUDE.md's
  // "Self-serve Basic->Pro upgrade" section). Creates a PENDING billing
  // record and alerts the admin — mirrors the existing /users/notify-payment
  // pattern used for agents/automations. Admin still does the actual
  // tier-flip via confirmPayment below; this only files the request.
  async notifyPayment(
    chatbotId: string,
    userId: string,
    dto: { kind: 'setup' | 'monthly' | 'upgrade'; transactionRef: string; notes?: string },
  ): Promise<{ ok: true }> {
    const chatbot = await this.findOne(chatbotId, userId);

    if (dto.kind === 'upgrade' && chatbot.plan?.tier !== 'basic') {
      throw new BadRequestException('This chatbot is already on Pro or Custom — nothing to upgrade to.');
    }

    const proPrice = dto.kind === 'upgrade' ? await this.resolveProMonthlyPrice(chatbot) : null;
    const amount =
      dto.kind === 'setup' ? chatbot.plan.setupFee
      : dto.kind === 'upgrade' ? (proPrice ?? chatbot.plan.monthlyFee)
      : chatbot.plan.monthlyFee;
    const kindLabel = dto.kind === 'setup' ? 'Setup fee' : dto.kind === 'upgrade' ? 'Tier upgrade (Basic → Pro)' : 'Monthly fee';

    await this.billingService.create({
      userId,
      userserviceId: chatbotId,
      moduleType: 'chatbot',
      moduleName: chatbot.name,
      amount,
      description: `${kindLabel} — ${chatbot.name} — ref ${dto.transactionRef}${dto.notes ? ` — ${dto.notes}` : ''}`,
      type: dto.kind === 'setup' ? BillingType.SETUP : BillingType.SUBSCRIPTION,
      status: BillingStatus.PENDING,
      kind: dto.kind,
      transactionRef: dto.transactionRef,
    });

    await this.emailService.sendAdminAlert(
      `💰 Chatbot payment notification — ${chatbot.name}`,
      `Chatbot: ${chatbot.name} (${chatbotId})<br>
       Kind: ${dto.kind}<br>
       Amount: ${chatbot.plan.currency} ${amount}<br>
       Transaction Ref: ${dto.transactionRef}<br>
       Notes: ${dto.notes || 'none'}<br><br>
       Go to admin dashboard to confirm and activate.`,
    );

    return { ok: true };
  }

  // Admin only — confirms a payment was received and activates billing.
  // kind:'upgrade' flips billing.tier to 'pro' and (best-effort) updates
  // monthlyFee to the template's real Pro price — see resolveProMonthlyPrice
  // above. If the price can't be resolved, the tier still flips (the
  // business intent — approve the upgrade — is unambiguous) but monthlyFee
  // is left as-is, same as every other admin-set-by-hand field here; the
  // admin can still correct it manually via the pricing editor above.
  async confirmPayment(
    id: string,
    dto: { kind: 'setup' | 'monthly' | 'upgrade'; billingRecordId?: string },
  ): Promise<ChatbotView> {
    const chatbot = await this.findOneAdmin(id);
    const now = new Date();

    if (dto.kind === 'setup') chatbot.status = UserServiceStatus.ACTIVE;

    if (dto.kind === 'upgrade') {
      chatbot.set('plan.tier', 'pro');
      const proPrice = await this.resolveProMonthlyPrice(chatbot);
      if (proPrice !== null) chatbot.set('plan.monthlyFee', proPrice);
    }

    if (chatbot.plan.monthlyFee > 0) {
      const next = new Date(now);
      next.setDate(next.getDate() + 30);
      chatbot.nextRenewalDate = next;
      chatbot.status = UserServiceStatus.ACTIVE;
    }

    const saved = await chatbot.save();
    await this.recordPaymentAndInvoice(saved, dto.kind, dto.billingRecordId, now);
    return toChatbotView(saved, true);
  }

  // The admin saw the money arrive: mark the customer's "I've paid" record
  // PAID — or, if they never submitted one, record the payment now — then
  // issue its invoice and email it. Invoicing is best-effort: a failure
  // there never undoes the confirmation itself.
  private async recordPaymentAndInvoice(
    chatbot: ChatbotUserServiceDocument, kind: 'setup' | 'monthly' | 'upgrade', billingRecordId: string | undefined, now: Date,
  ): Promise<void> {
    const id = String(chatbot._id);
    const tierName = chatbot.plan?.tier === 'pro' ? 'Pro' : chatbot.plan?.tier === 'custom' ? 'Custom' : 'Basic';
    const amount = kind === 'setup' ? chatbot.plan?.setupFee || 0 : chatbot.plan?.monthlyFee || 0;

    let record = billingRecordId ? await this.billingService.findById(billingRecordId) : await this.billingService.findPending(id, kind);
    if (record && String(record.userserviceId) !== id) record = null;
    if (record) {
      await this.billingService.updateStatus(String(record._id), BillingStatus.PAID);
    } else {
      if (!amount) return;
      record = await this.billingService.create({
        userId: chatbot.userId.toString(),
        userserviceId: id,
        moduleType: 'chatbot',
        moduleName: chatbot.name,
        amount,
        description: `${kind === 'setup' ? 'Setup fee' : kind === 'upgrade' ? 'Tier upgrade (Basic → Pro)' : 'Monthly fee'} — ${chatbot.name} — confirmed by admin`,
        type: kind === 'setup' ? BillingType.SETUP : BillingType.SUBSCRIPTION,
        status: BillingStatus.PAID,
        kind,
      });
    }
    if (!record.amount) return;

    try {
      const serviceName = await this.serviceNameFor(chatbot);
      const line = kind === 'setup'
        ? `${serviceName} "${chatbot.name}" — one-time setup fee`
        : kind === 'upgrade'
          ? `${serviceName} "${chatbot.name}" — upgrade to the Pro plan, first month`
          : `${serviceName} "${chatbot.name}" — ${tierName} plan, monthly fee`;
      const periodEnd = kind === 'setup' ? undefined : chatbot.nextRenewalDate || undefined;
      const issued = await this.billingService.issueInvoice(String(record._id), {
        line, periodStart: periodEnd ? now : undefined, periodEnd,
      });
      const owner = await this.userModel.findById(chatbot.userId).select('name email').lean();
      if (!owner) return;
      const { filename, pdf } = await this.billingService.invoicePdf(String(issued._id), { userId: '', isAdmin: true });
      await this.emailService.sendInvoiceEmail(owner as any, {
        chatbotId: id, serviceName, invoiceNumber: issued.invoiceNumber!, amount: issued.amount,
        currency: issued.currency || 'USD', filename, pdf,
      });
    } catch (err: any) {
      this.logger.error(`Invoice for chatbot ${id} (${kind}) failed: ${err?.message || err}`);
    }
  }

  private async serviceNameFor(chatbot: ChatbotUserServiceDocument): Promise<string> {
    try {
      const svc: any = await this.servicesService.findOne(String(chatbot.serviceId));
      return svc?.name || 'Chatbot';
    } catch {
      return 'Chatbot';
    }
  }

  async getBillingHistory(chatbotId: string, userId: string, isAdmin: boolean) {
    const chatbot = isAdmin ? await this.findOneAdmin(chatbotId) : await this.findOne(chatbotId, userId);
    const history = await this.billingService.findByUserService(chatbotId);
    return { billing: toChatbotView(chatbot, isAdmin).billing, history };
  }
}

// Only these fields are writable on a knowledge entry (chatbotId/embedding
// are set by the server). `type` may change between faq and text on edit.
function pickKnowledgeFields(dto: any) {
  const out: Record<string, any> = {};
  if (dto?.type !== undefined) {
    if (!['faq', 'text', 'url'].includes(dto.type)) throw new BadRequestException('Unknown entry type');
    out.type = dto.type;
  }
  for (const key of ['question', 'answer', 'content', 'sourceUrl', 'linkLabel']) {
    if (dto?.[key] !== undefined) out[key] = typeof dto[key] === 'string' ? dto[key].trim() : dto[key];
  }
  return out;
}
