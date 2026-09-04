import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Chatbot, ChatbotDocument } from './schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseDocument } from './schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyProvider } from '../api-keys/schemas/api-key.schema';
import { BillingService } from '../billing/billing.service';
import { BillingStatus, BillingType } from '../billing/schemas/billing.schema';
import { EmailService } from '../email/email.service';
import { ModulesService } from '../modules/modules.service';

// Fields the chatbot's own owner is allowed to change via PUT /chatbots/:id.
// Deliberately excludes `billing` and `embedKey` — those are admin-only /
// system-generated and must never be settable by the customer themselves.
const CUSTOMER_EDITABLE_FIELDS = [
  'name',
  'description',
  'persona',
  'language',
  'template',
  'status',
  'fallbackMessage',
  'fallbackMessage_ar',
  'humanHandoff',
  'channels',
];

function pickCustomerEditable(dto: any): any {
  const out: any = {};
  for (const key of CUSTOMER_EDITABLE_FIELDS) {
    if (dto[key] !== undefined) out[key] = dto[key];
  }
  return out;
}

@Injectable()
export class ChatbotsService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotsService.name);

  constructor(
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel('User') private userModel: Model<any>,
    private apiKeysService: ApiKeysService,
    private billingService: BillingService,
    private emailService: EmailService,
    private modulesService: ModulesService,
  ) {}

  // Self-healing backfill (same pattern as ModulesService's) for the
  // billing.tier field added alongside tiered chatbot pricing (see backend
  // CLAUDE.md). Every existing chatbot doc reads tier: 'basic' by default
  // (the schema default), which is correct for the vast majority — but a
  // bot that already has WhatsApp or Instagram credentials configured is
  // clearly already using a Pro-tier feature, and gating it to Basic on
  // this deploy would silently break a channel that was working a moment
  // ago. Only touches docs still at the 'basic' default, so an admin who's
  // already set a tier explicitly (including deliberately downgrading one)
  // is never overwritten.
  async onModuleInit() {
    const result = await this.chatbotModel.updateMany(
      {
        'billing.tier': 'basic',
        $or: [
          { 'channels.whatsapp.enabled': true, 'channels.whatsapp.phoneNumberId': { $exists: true, $ne: '' } },
          { 'channels.instagram.enabled': true, 'channels.instagram.accountId': { $exists: true, $ne: '' } },
        ],
      },
      { $set: { 'billing.tier': 'pro' } },
    );
    if (result.modifiedCount) {
      this.logger.log(`Backfilled billing.tier to 'pro' on ${result.modifiedCount} chatbot(s) with an already-configured WhatsApp/Instagram channel`);
    }
  }

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
  async create(userId: string, dto: any): Promise<ChatbotDocument> {
    const embedKey = crypto.randomBytes(16).toString('hex');
    const { moduleSlug, tier: requestedTier, ...rest } = dto;

    const billing: any = {};
    const tier = requestedTier === 'pro' ? 'pro' : 'basic';

    if (moduleSlug) {
      try {
        const module = await this.modulesService.findOne(moduleSlug);
        const tierPricing = module.pricingTiers?.find((t: any) => t.key === tier);
        billing.setupFee = 0;
        billing.monthlyFee = tierPricing?.monthly ?? module.pricing?.monthly ?? 0;
        billing.currency = 'USD';
        billing.tier = tierPricing ? tier : 'basic';
      } catch (err) {
        this.logger.warn(`create() couldn't load module "${moduleSlug}" for pricing: ${err?.message}`);
      }
    }

    billing.trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const chatbot = await this.chatbotModel.create({
      ...rest,
      userId: new Types.ObjectId(userId),
      embedKey,
      billing,
    });

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

    return chatbot;
  }

  async findAllByUser(userId: string): Promise<ChatbotDocument[]> {
    return this.chatbotModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  // isAdmin bypasses the ownership check — lets an admin view/manage a
  // client's chatbot through the same routes the client themselves uses
  // (onboarding a client after a deal closes, or helping with support),
  // without duplicating every method for an admin-only variant.
  async findOne(id: string, userId: string, isAdmin = false): Promise<ChatbotDocument> {
    const chatbot = await this.chatbotModel.findById(id);
    if (!chatbot) throw new NotFoundException('Chatbot not found');
    if (!isAdmin && chatbot.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    return chatbot;
  }

  // Admin-only lookup — no ownership check. Only ever call this from a route
  // that has already verified req.user.role === 'admin'.
  async findOneAdmin(id: string): Promise<ChatbotDocument> {
    const chatbot = await this.chatbotModel.findById(id);
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
  async findAllAdmin(): Promise<any[]> {
    const bots = await this.chatbotModel
      .find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const ownerIds = [...new Set(
      bots.map((b) => (b.userId as any)?._id?.toString()).filter(Boolean),
    )];
    const ownersWithOpenAiKey = await this.apiKeysService.getUserIdsWithActiveKey(
      ownerIds,
      ApiKeyProvider.OPENAI,
    );

    return bots.map((b) => {
      const ownerId = (b.userId as any)?._id?.toString();
      const noOpenAiKey = !ownerId || !ownersWithOpenAiKey.has(ownerId);
      const whatsappPending = !!b.channels?.whatsapp?.enabled && !b.channels?.whatsapp?.phoneNumberId;
      const instagramPending = !!b.channels?.instagram?.enabled && !b.channels?.instagram?.accountId;
      return {
        ...b,
        setupFlags: { noOpenAiKey, whatsappPending, instagramPending },
        needsSetup: noOpenAiKey || whatsappPending || instagramPending,
      };
    });
  }

  // One plan, everything included — same story as agents/automations. No
  // per-tier channel gating: once subscribed, a chatbot owner can enable
  // website/WhatsApp/Instagram freely.
  async update(id: string, userId: string, dto: any, isAdmin = false): Promise<ChatbotDocument> {
    const chatbot = await this.findOne(id, userId, isAdmin);
    const changes = pickCustomerEditable(dto);

    // Setup/exploration stays open to an unverified account — only going
    // live is gated. Deliberately not a full account lock/deadline: that
    // would punish anyone still mid-setup for a slow inbox, and the
    // verification link itself already expires in 24h (see
    // AuthService.register()) with a one-click resend, so there's already
    // a natural forcing function without adding a second one here.
    if (changes.status === 'active' && chatbot.status !== 'active') {
      const owner = await this.userModel.findById(chatbot.userId).select('isEmailVerified').lean();
      if (!owner || !(owner as any).isEmailVerified) {
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
    if (chatbot.billing.tier === 'basic') {
      if (changes.channels?.whatsapp?.enabled === true) {
        throw new ForbiddenException('WhatsApp integration requires the Pro plan. Upgrade to enable it.');
      }
      if (changes.channels?.instagram?.enabled === true) {
        throw new ForbiddenException('Instagram integration requires the Pro plan. Upgrade to enable it.');
      }
    }

    Object.assign(chatbot, changes);
    return chatbot.save();
  }

  async delete(id: string, userId: string, isAdmin = false): Promise<{ message: string }> {
    const chatbot = await this.findOne(id, userId, isAdmin);
    const chatbotId = chatbot._id as Types.ObjectId;
    await Promise.all([
      this.chatbotModel.findByIdAndDelete(chatbotId),
      this.knowledgeBaseModel.deleteMany({ chatbotId }),
      this.conversationModel.deleteMany({ chatbotId }),
    ]);
    return { message: 'Chatbot deleted' };
  }

  private async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data[0].embedding as number[];
  }

  // LogicMate is bring-your-own-key: every chatbot owner must add their own
  // OpenAI key via Dashboard → API Keys before knowledge base embedding works.
  // No platform-wide fallback — each customer's usage is billed on their own key.
  private async resolveOpenAiKey(userId: string): Promise<string | null> {
    try {
      return await this.apiKeysService.getDecryptedKey(userId, ApiKeyProvider.OPENAI);
    } catch {
      return null;
    }
  }

  async addKnowledge(chatbotId: string, userId: string, dto: any, isAdmin = false): Promise<KnowledgeBaseDocument> {
    // Verify ownership (or admin access)
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);

    let embedding: number[] = [];

    try {
      // Always embeds with the bot OWNER's key (BYOK) — an admin adding
      // knowledge on a client's behalf still bills the client's own key,
      // never a platform-wide fallback.
      const apiKey = await this.resolveOpenAiKey(chatbot.userId.toString());
      if (!apiKey) throw new Error('No OpenAI key available');

      let textToEmbed = '';
      if (dto.type === 'faq') {
        textToEmbed = `${dto.question || ''} ${dto.answer || ''}`.trim();
      } else {
        textToEmbed = dto.content || '';
      }

      if (textToEmbed) {
        embedding = await this.getEmbedding(textToEmbed, apiKey);
      }
    } catch (err) {
      // No API key or embedding failed — store without embedding
      this.logger.warn(`addKnowledge() embedding skipped for chatbot=${chatbotId}: ${err?.message}`);
      embedding = [];
    }

    return this.knowledgeBaseModel.create({
      ...dto,
      chatbotId: new Types.ObjectId(chatbotId),
      embedding,
    });
  }

  async listKnowledge(chatbotId: string, userId: string, isAdmin = false): Promise<KnowledgeBaseDocument[]> {
    await this.findOne(chatbotId, userId, isAdmin);
    return this.knowledgeBaseModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .select('-embedding')
      .sort({ createdAt: -1 });
  }

  async deleteKnowledge(chatbotId: string, knowledgeId: string, userId: string, isAdmin = false): Promise<{ message: string }> {
    await this.findOne(chatbotId, userId, isAdmin);
    const result = await this.knowledgeBaseModel.findOneAndDelete({
      _id: new Types.ObjectId(knowledgeId),
      chatbotId: new Types.ObjectId(chatbotId),
    });
    if (!result) throw new NotFoundException('Knowledge entry not found');
    return { message: 'Knowledge entry deleted' };
  }

  async getConversations(chatbotId: string, userId: string, limit = 20, isAdmin = false): Promise<ConversationDocument[]> {
    await this.findOne(chatbotId, userId, isAdmin);
    return this.conversationModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .sort({ createdAt: -1 })
      .limit(Number(limit));
  }

  async getAnalytics(chatbotId: string, userId: string, isAdmin = false): Promise<any> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);

    // Analytics is a Pro+ feature — the config page hides this tab entirely
    // for Basic, this is the server-side backstop for a direct API call.
    if (chatbot.billing.tier === 'basic') {
      throw new ForbiddenException('Analytics requires the Pro plan. Upgrade to unlock it.');
    }

    const conversations = await this.conversationModel.find({
      chatbotId: new Types.ObjectId(chatbotId),
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

  async getEmbedCode(chatbotId: string, userId: string, isAdmin = false): Promise<{ embedCode: string }> {
    const chatbot = await this.findOne(chatbotId, userId, isAdmin);
    const color = chatbot.channels?.website?.customColor || '#7c3aed';
    const welcome = chatbot.channels?.website?.welcomeMessage || '';
    const welcomeAr = chatbot.channels?.website?.welcomeMessage_ar || '';
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.logicmate.io';
    const backendUrl = process.env.PUBLIC_API_URL || process.env.BACKEND_URL || 'https://www.logicmate.io';
    const apiUrl = `${backendUrl.replace(/\/$/, '')}/api/v1`;
    const embedCode = `<!-- LogicMate Chatbot Widget -->
<script>
  window.LMChatbot = {
    embedKey: "${chatbot.embedKey}",
    color: "${color}",
    apiUrl: "${apiUrl}",
    botName: "${chatbot.name.replace(/"/g, '\\"')}"${welcome ? `,\n    welcomeMessage: "${welcome.replace(/"/g, '\\"')}"` : ''}${welcomeAr ? `,\n    welcomeMessageAr: "${welcomeAr.replace(/"/g, '\\"')}"` : ''}
  };
</script>
<script src="${frontendUrl}/chatbot-widget.js" async></script>`;
    return { embedCode };
  }

  // ── Pricing & billing (admin-set, manual bank-transfer payment) ────────

  // Admin only — sets what this specific chatbot costs. No fixed public
  // tiers yet: every deal is priced by hand until real patterns emerge.
  async updatePricing(
    id: string,
    dto: { setupFee?: number; monthlyFee?: number; currency?: string; trialEndsAt?: string; notes?: string; tier?: 'basic' | 'pro' | 'custom' },
  ): Promise<ChatbotDocument> {
    const chatbot = await this.findOneAdmin(id);

    if (dto.setupFee !== undefined) chatbot.billing.setupFee = dto.setupFee;
    if (dto.monthlyFee !== undefined) chatbot.billing.monthlyFee = dto.monthlyFee;
    if (dto.currency !== undefined) chatbot.billing.currency = dto.currency;
    if (dto.trialEndsAt !== undefined) chatbot.billing.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.notes !== undefined) chatbot.billing.notes = dto.notes;
    // The only way a chatbot's tier changes today — an upgrade request is
    // handled by admin here, same hand-set-price model as everything else
    // in this method. See backend CLAUDE.md's "Tiered chatbot pricing"
    // section for why a self-serve upgrade-payment flow wasn't built yet.
    if (dto.tier !== undefined) chatbot.billing.tier = dto.tier;

    // First time a real price is set, move it out of "trial" so the
    // customer sees they owe a setup payment (unless it's already active).
    if (chatbot.billing.status === 'trial' && (chatbot.billing.setupFee > 0 || chatbot.billing.monthlyFee > 0)) {
      chatbot.billing.status = 'awaiting_setup_payment';
    }

    return chatbot.save();
  }

  // Customer calls this after making the bank transfer. Creates a PENDING
  // billing record and alerts the admin — mirrors the existing
  // /users/notify-payment pattern used for agents/automations.
  async notifyPayment(
    chatbotId: string,
    userId: string,
    dto: { kind: 'setup' | 'monthly'; transactionRef: string; notes?: string },
  ): Promise<{ ok: true }> {
    const chatbot = await this.findOne(chatbotId, userId);
    const amount = dto.kind === 'setup' ? chatbot.billing.setupFee : chatbot.billing.monthlyFee;

    await this.billingService.create({
      userId,
      chatbotId,
      moduleType: 'chatbot',
      moduleName: chatbot.name,
      amount,
      description: `${dto.kind === 'setup' ? 'Setup fee' : 'Monthly fee'} — ${chatbot.name} — ref ${dto.transactionRef}${dto.notes ? ` — ${dto.notes}` : ''}`,
      type: dto.kind === 'setup' ? BillingType.SETUP : BillingType.SUBSCRIPTION,
      status: BillingStatus.PENDING,
    });

    await this.emailService.sendAdminAlert(
      `💰 Chatbot payment notification — ${chatbot.name}`,
      `Chatbot: ${chatbot.name} (${chatbotId})<br>
       Kind: ${dto.kind}<br>
       Amount: ${chatbot.billing.currency} ${amount}<br>
       Transaction Ref: ${dto.transactionRef}<br>
       Notes: ${dto.notes || 'none'}<br><br>
       Go to admin dashboard to confirm and activate.`,
    );

    return { ok: true };
  }

  // Admin only — confirms a payment was received and activates billing.
  async confirmPayment(
    id: string,
    dto: { kind: 'setup' | 'monthly'; billingRecordId?: string },
  ): Promise<ChatbotDocument> {
    const chatbot = await this.findOneAdmin(id);
    const now = new Date();

    if (dto.kind === 'setup') {
      chatbot.billing.setupPaidAt = now;
      chatbot.billing.status = 'active';
    }
    if (chatbot.billing.monthlyFee > 0) {
      chatbot.billing.lastBillingDate = now;
      const next = new Date(now);
      next.setDate(next.getDate() + 30);
      chatbot.billing.nextBillingDate = next;
      if (chatbot.billing.status !== 'active') chatbot.billing.status = 'active';
    }

    if (dto.billingRecordId) {
      await this.billingService.updateStatus(dto.billingRecordId, BillingStatus.PAID);
    }

    return chatbot.save();
  }

  async getBillingHistory(chatbotId: string, userId: string, isAdmin: boolean) {
    const chatbot = isAdmin ? await this.findOneAdmin(chatbotId) : await this.findOne(chatbotId, userId);
    const history = await this.billingService.findByChatbot(chatbotId);
    return { billing: chatbot.billing, history };
  }
}
