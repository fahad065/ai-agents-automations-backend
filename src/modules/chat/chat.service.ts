import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CHATBOT_FILTER, ChatbotUserService, ChatbotUserServiceDocument } from '../userservices/schemas/userservice.schema';
import { ChatbotView, toChatbotView } from '../userservices/chatbot-view';
import { KnowledgeBase, KnowledgeBaseDocument } from '../chatbots/schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from '../chatbots/schemas/conversation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyProvider } from '../api-keys/schemas/api-key.schema';
import { callChatCompletion, embeddingProviderFor, getEmbeddingVector, ChatMessage } from '../api-keys/ai-provider.util';
import { knowledgeSnippet } from './knowledge-format';
import { rankByKeywords } from './keyword-rank';

// Entries given to the model when ranking by word matching. A few more than
// the 4 used with semantic search, since word matching is less precise.
const KEYWORD_TOP_N = 6;
import { isChatbotBillingActive } from '../chatbots/billing-status.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/schemas/notification.schema';
import { EmailService } from '../email/email.service';
import * as Sentry from '@sentry/nestjs';
import * as crypto from 'crypto';

// Constant-time string comparison (different lengths never match).
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// Line added to a hand-off reply when we don't yet know how to reach the
// customer (English, Arabic).
const CONTACT_REQUESTS = [
  'So our team can get back to you, could you share your name and phone number (or email)?',
  'عشان يتواصل معك فريقنا، ممكن ترسل لي اسمك ورقم تلفونك (أو إيميلك)؟',
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ChatbotUserService.name) private chatbotModel: Model<ChatbotUserServiceDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private apiKeysService: ApiKeysService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  // LogicMate is bring-your-own-key: every chatbot owner must add their own
  // key for whichever provider their bot is configured to use (Dashboard →
  // API Keys) before it can reply with AI. No platform-wide fallback —
  // each customer's usage is billed on their own key.
  private async resolveKey(userId: string, provider: ApiKeyProvider): Promise<string | null> {
    try {
      return await this.apiKeysService.getDecryptedKey(userId, provider);
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(chatbot: ChatbotView, knowledgeSnippets: string[]): string {
    let languageInstruction = 'Respond in the same language the user writes in.';
    if (chatbot.language === 'en') languageInstruction = 'Only respond in English.';
    if (chatbot.language === 'ar') languageInstruction = 'Only respond in Arabic.';

    const knowledgeSection =
      knowledgeSnippets.length > 0
        ? `Knowledge base:\n${knowledgeSnippets.join('\n\n')}`
        : 'No knowledge base entries are available.';

    const bookingInstruction = chatbot.bookingUrl
      ? `If the customer wants to book/reserve/schedule something, share this link so they can pick a time themselves: ${chatbot.bookingUrl}. Still ask for their name and phone number too, in case the team needs to follow up directly.`
      : `There is no separate booking link for this business — if the customer wants to book/reserve something, handle it entirely through the conversation: ask for their name, phone number, preferred date/time, and any other relevant detail (e.g. party size), and let them know the team will confirm with them directly.`;

    // Locations section — deliberately NOT run through the knowledge-base's
    // top-4 similarity ranking above, since a business with several
    // branches needs the model reasoning over ALL of them at once to
    // answer "which one is near X" or "do you have a branch in Y"
    // correctly — a similarity search could easily retrieve the wrong
    // subset. Empty for the vast majority of chatbots (single location),
    // in which case this is a complete no-op.
    const outletsSection =
      chatbot.outlets && chatbot.outlets.length > 0
        ? `This business has multiple locations. Use these to answer questions about which branch to visit, whether a location/area is covered, hours or facilities at a specific branch, or delivery platforms available there:\n${chatbot.outlets
            .map((o) => {
              const parts = [`- ${o.name} — ${o.city}, ${o.country}`];
              if (o.address) parts.push(`Address: ${o.address}`);
              if (o.areaTags?.length) parts.push(`Also serves/known as: ${o.areaTags.join(', ')}`);
              if (o.isOnlineOnly) parts.push('Delivery/online-only — no dine-in at this location');
              if (o.hours) parts.push(`Hours: ${o.hours}`);
              if (o.deliveryPlatforms?.length) parts.push(`Order via: ${o.deliveryPlatforms.join(', ')}`);
              if (o.phone) parts.push(`Phone: ${o.phone}`);
              if (o.mapUrl) parts.push(`Directions: ${o.mapUrl}`);
              if (o.facilities?.length) parts.push(`Facilities/services: ${o.facilities.join(', ')}`);
              if (o.insurance?.length) parts.push(`Insurance accepted: ${o.insurance.join(', ')} (any other insurer: not listed — say so and offer to check with the team)`);
              if (o.notes) parts.push(o.notes);
              return parts.join(' | ');
            })
            .join('\n')}\n\nIf a customer names an area/neighborhood, match it against each location's address and "also serves" list to recommend the right one — if none clearly matches, say so rather than guessing, and offer the full location list instead.`
        : '';

    return `You are ${chatbot.name}, a helpful customer service assistant.
Persona: ${chatbot.persona || 'friendly and professional'}.
Language: ${languageInstruction}
IMPORTANT: Only answer questions based on the knowledge base and locations below. If the question is not covered, say: "${chatbot.fallbackMessage}".
Do not make up information.
When a knowledge-base answer includes a link (for example a Google Maps location, a menu, a booking page), share that exact link with the customer — never change or invent links.

Whenever it's natural — especially if the customer wants to book, order, get a quote, or asks to be contacted — politely ask for their name, phone number and email if they haven't shared them yet. Weave this into the conversation over a message or two rather than demanding all three at once, and never block answering their actual question just to collect these details.

${bookingInstruction}

${outletsSection}

${knowledgeSection}`;
  }

  // Runs a second, cheap gpt-4o-mini call to pull structured contact details
  // out of whatever the customer just said — decoupled from the main reply
  // so it works regardless of how well the model follows the "ask for
  // contact info" instruction above. Only called while at least one of
  // name/email/phone is still missing, so it naturally stops once a lead
  // is fully captured instead of running on every message forever.
  private async extractLeadInfo(
    provider: ApiKeyProvider,
    apiKey: string,
    recentMessages: { role: string; content: string }[],
    known: { name?: string; email?: string; phone?: string },
  ): Promise<{ name?: string; email?: string; phone?: string }> {
    const missing: string[] = [];
    if (!known.name) missing.push('name');
    if (!known.email) missing.push('email');
    if (!known.phone) missing.push('phone');
    if (!missing.length) return {};

    try {
      // Always the cheap/fast "auto" model for this utility call, regardless
      // of whatever model the chatbot's chatModelConfig picked for the
      // customer-facing reply — no reason to pay for a bigger model here.
      const content = await callChatCompletion({
        provider,
        apiKey,
        temperature: 0,
        maxTokens: 150,
        jsonMode: true,
        messages: [
          {
            role: 'system',
            content: `Extract the customer's own contact details from this chat, if shared. Return strict JSON: {"name": string|null, "email": string|null, "phone": string|null}. Only include a field the customer explicitly stated about themselves — never guess, infer, or invent one. Normalize phone numbers to digits with an optional leading "+". Still missing: ${missing.join(', ')}.`,
          },
          ...(recentMessages as ChatMessage[]),
        ],
      });
      const parsed = JSON.parse(content || '{}');
      const result: { name?: string; email?: string; phone?: string } = {};
      if (typeof parsed.name === 'string' && parsed.name.trim()) result.name = parsed.name.trim();
      if (typeof parsed.email === 'string' && parsed.email.trim()) result.email = parsed.email.trim();
      if (typeof parsed.phone === 'string' && parsed.phone.trim()) result.phone = parsed.phone.trim();
      return result;
    } catch {
      return {};
    }
  }

  // Notifies the chatbot owner (dashboard notification + email) the first
  // time a conversation yields a phone number or email — on every tier,
  // since a Basic-plan client following up manually needs this just as
  // much as a Pro one. Never blocks the reply — caller fires this and
  // moves on, logging failures instead of surfacing them to the customer.
  private async notifyLead(
    chatbot: ChatbotView,
    conversation: ConversationDocument,
    snippet: string,
  ): Promise<void> {
    const owner = await this.userModel.findById(chatbot.userId).select('name email').lean();
    if (!owner) return;

    const chatbotId = chatbot._id.toString();
    await this.notificationsService.create({
      userId: chatbot.userId.toString(),
      type: NotificationType.CHATBOT_LEAD,
      title: `New lead from "${chatbot.name}"`,
      message: `${conversation.visitorName || 'A customer'} — ${conversation.visitorPhone || conversation.visitorEmail}`,
      priority: NotificationPriority.HIGH,
      icon: '🎯',
      actionUrl: `/dashboard/chatbots/${chatbotId}?tab=conversations`,
      metadata: {
        chatbotId,
        visitorName: conversation.visitorName,
        visitorEmail: conversation.visitorEmail,
        visitorPhone: conversation.visitorPhone,
      },
    });

    await this.emailService.sendChatbotLeadEmail(
      { name: (owner as any).name, email: (owner as any).email },
      {
        chatbotId,
        chatbotName: chatbot.name,
        visitorName: conversation.visitorName,
        visitorEmail: conversation.visitorEmail,
        visitorPhone: conversation.visitorPhone,
        snippet: snippet.slice(0, 200),
        waitingForTeam: conversation.status === 'handoff',
      },
    );
  }

  // Cheap keyword check for an explicit human-request — no extra LLM call,
  // so it's instant and doesn't add latency to the reply. This is one of
  // two ways a conversation escalates (see chat() below); the other is
  // simply the bot falling back because nothing in the knowledge base
  // covers the question.
  // Asked when a conversation is handed to the team but we don't yet know
  // how to reach the customer. Arabic when the bot is Arabic-only or the
  // customer wrote in Arabic, otherwise English.
  private contactRequest(chatbot: ChatbotView, message: string): string {
    const arabic = chatbot.language === 'ar' || (chatbot.language !== 'en' && /[\u0600-\u06FF]/.test(message));
    return arabic ? CONTACT_REQUESTS[1] : CONTACT_REQUESTS[0];
  }

  private looksLikeHumanRequest(message: string): boolean {
    return /\b(human|real person|speak (to|with) (a |someone)|talk (to|with) (a |someone)|representative|agent|(?:a )?(?:real )?(?:staff|team) member)\b/i.test(
      message,
    );
  }

  // Notifies the chatbot owner (dashboard notification + email) the first
  // time a conversation needs a human — either the bot couldn't answer
  // from its knowledge base, or the customer explicitly asked for a
  // person. Only runs when the owner has humanHandoff enabled (see
  // Chatbot.humanHandoff) — leaving it off keeps today's existing
  // behavior unchanged (just the fallback message, no notification).
  // Fire-and-forget, same pattern as notifyLead() above.
  private async notifyHandoff(
    chatbot: ChatbotView,
    conversation: ConversationDocument,
    snippet: string,
  ): Promise<void> {
    const owner = await this.userModel.findById(chatbot.userId).select('name email').lean();
    if (!owner) return;

    const chatbotId = chatbot._id.toString();
    await this.notificationsService.create({
      userId: chatbot.userId.toString(),
      type: NotificationType.CHATBOT_HANDOFF,
      title: `A customer needs you — "${chatbot.name}"`,
      message: `${conversation.visitorName || 'A customer'} couldn't be helped by the bot`,
      priority: NotificationPriority.HIGH,
      icon: '🙋',
      actionUrl: `/dashboard/chatbots/${chatbotId}?tab=conversations`,
      metadata: {
        chatbotId,
        visitorName: conversation.visitorName,
        visitorEmail: conversation.visitorEmail,
        visitorPhone: conversation.visitorPhone,
      },
    });

    await this.emailService.sendChatbotHandoffEmail(
      { name: (owner as any).name, email: (owner as any).email },
      {
        chatbotId,
        chatbotName: chatbot.name,
        visitorName: conversation.visitorName,
        visitorEmail: conversation.visitorEmail,
        visitorPhone: conversation.visitorPhone,
        snippet: snippet.slice(0, 200),
      },
    );
  }

  // A chatbot is a userservices row (type 'chatbot') found by its public
  // embedKey. `chatbot` is the flat view the engine reads; `row` keeps the
  // subscription fields (status, trialEndDate) for the billing gate.
  private async findBot(embedKey: string): Promise<{ chatbot: ChatbotView | null; row: any }> {
    if (!embedKey) return { chatbot: null, row: null };
    const row = await this.chatbotModel
      .findOne({ ...CHATBOT_FILTER, isDeleted: false, 'config.embedKey': embedKey })
      .lean();
    return { chatbot: row ? toChatbotView(row) : null, row };
  }

  // Public, read-only widget config — lets chatbot-widget.js fetch the
  // owner's *current* name/color/welcome message on every page load
  // instead of the customer's pasted <script> tag baking in a one-time
  // snapshot. Without this, an admin changing the color picker in the
  // dashboard would never be visible on an already-embedded site until
  // the customer went back and re-copied/re-pasted the whole embed
  // snippet — a real, confusing gap for something as routine as a color
  // change. The embedKey/apiUrl in the pasted snippet still need to stay
  // static (they identify which bot and which backend to talk to), but
  // everything cosmetic now lives here instead of frozen in the script.
  async getPublicConfig(
    embedKey: string,
  ): Promise<{ name: string; color: string; welcomeMessage: string; welcomeMessageAr: string }> {
    const { chatbot } = await this.findBot(embedKey);
    if (!chatbot || chatbot.status !== 'active') {
      throw new NotFoundException('Chatbot not found');
    }
    return {
      name: chatbot.name,
      color: chatbot.channels?.website?.customColor || '#7c3aed',
      welcomeMessage: chatbot.channels?.website?.welcomeMessage || '',
      welcomeMessageAr: chatbot.channels?.website?.welcomeMessage_ar || '',
    };
  }

  async chat(
    embedKey: string,
    sessionId: string,
    message: string,
    channel: 'website' | 'whatsapp' | 'instagram' = 'website',
  ): Promise<{ reply: string; sessionId: string; handoff: boolean }> {
    // 1. Find chatbot
    const { chatbot, row } = await this.findBot(embedKey);
    if (!chatbot || !row || chatbot.status !== 'active') {
      return {
        reply: "This chatbot is not currently available.",
        sessionId,
        handoff: false,
      };
    }

    // Billing gate — a trial that has run out (or a suspended/past-due
    // subscription) stops answering even though the owner never flipped
    // `status` themselves. Without this check a lapsed trial would keep
    // answering for free indefinitely, since `status` and `billing.status`
    // are tracked separately.
    if (!isChatbotBillingActive(row)) {
      return {
        reply: chatbot.fallbackMessage,
        sessionId,
        handoff: false,
      };
    }

    // 2. Find or create conversation
    let conversation = await this.conversationModel.findOne({ userserviceId: chatbot._id, sessionId });
    if (!conversation) {
      conversation = await this.conversationModel.create({
        userserviceId: chatbot._id,
        sessionId,
        channel,
        messages: [],
        // On WhatsApp, sessionId IS the customer's phone number — capture it
        // immediately rather than asking the AI to re-extract what we
        // already have with certainty.
        visitorPhone: channel === 'whatsapp' ? sessionId : undefined,
      });
    }

    // 3. Add user message
    conversation.messages.push({ role: 'user', content: message, timestamp: new Date() });

    try {
      // 4. Resolve the bot's one AI provider/model + the owner's BYOK key
      // for it (OpenAI/auto for bots that never chose). The knowledge base
      // is embedded with the same provider; Anthropic has no embeddings
      // API, so a Claude bot ranks knowledge by word matching.
      const userId = chatbot.userId.toString();
      const chatProvider = chatbot.chatModelConfig?.provider || ApiKeyProvider.OPENAI;
      const chatModel = chatbot.chatModelConfig?.model;
      const embeddingProvider = embeddingProviderFor(chatProvider);

      const apiKey = await this.resolveKey(userId, chatProvider);
      if (!apiKey) {
        this.logger.warn(`No ${chatProvider} key on file for chatbot owner — returning fallbackMessage for embedKey=${embedKey}`);
      }
      const embeddingApiKey = embeddingProvider ? apiKey : null;

      // 5. Retrieve knowledge entries
      const allKnowledge = await this.knowledgeBaseModel
        .find({ userserviceId: chatbot._id })
        .select('+embedding');

      let knowledgeSnippets: string[] = [];

      if (embeddingApiKey && allKnowledge.length > 0) {
        // Get embeddings for knowledge with vectors
        const knowledgeWithEmbeddings = allKnowledge.filter(
          (k) => k.embedding && k.embedding.length > 0,
        );

        if (knowledgeWithEmbeddings.length > 0) {
          try {
            const queryEmbedding = await getEmbeddingVector({
              provider: embeddingProvider!,
              apiKey: embeddingApiKey,
              text: message,
            });

            // Find top 4 by cosine similarity. Only vectors from the same
            // embedding model are comparable (an entry still waiting to be
            // re-embedded after a provider switch has a different length).
            const comparable = knowledgeWithEmbeddings.filter((k) => k.embedding.length === queryEmbedding.length);
            if (!comparable.length) throw new Error('no comparable knowledge vectors');
            const scored = comparable
              .map((k) => ({ entry: k, score: cosineSim(queryEmbedding, k.embedding) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 4);

            knowledgeSnippets = scored.map((s) => {
              return knowledgeSnippet(s.entry);
            });
          } catch {
            // Embedding failed — fall back to word matching
            knowledgeSnippets = rankByKeywords(allKnowledge, message, KEYWORD_TOP_N).map((k) => {
              return knowledgeSnippet(k);
            });
          }
        } else {
          // Knowledge exists but no embeddings — word matching
          knowledgeSnippets = rankByKeywords(allKnowledge, message, KEYWORD_TOP_N).map((k) => {
            return knowledgeSnippet(k);
          });
        }
      } else {
        // No embedding key (e.g. a Claude-only bot — Anthropic has no
        // embeddings API): pick entries by word matching instead of just
        // taking the first few, so entry #30 is as reachable as entry #1.
        knowledgeSnippets = rankByKeywords(allKnowledge, message, KEYWORD_TOP_N).map((k) => {
          return knowledgeSnippet(k);
        });
      }

      const systemPrompt = this.buildSystemPrompt(chatbot, knowledgeSnippets);

      // 6. Build conversation history (last 10 messages)
      const history = conversation.messages.slice(-10);
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      ];

      let reply = chatbot.fallbackMessage;

      if (apiKey) {
        // 7. Call the configured provider
        try {
          const content = await callChatCompletion({
            provider: chatProvider,
            model: chatModel,
            apiKey,
            messages: chatMessages,
            maxTokens: 512,
            temperature: 0.7,
          });
          reply = content || chatbot.fallbackMessage;
        } catch (err: any) {
          this.logger.error(`${chatProvider} chat completion failed: ${err?.message}`);
        }
      }

      // 8. Escalate to a human when the owner has opted in (humanHandoff)
      // and either the bot fell back to its default "I don't know" message
      // (nothing in the knowledge base covered the question) or the
      // customer explicitly asked for a person. Off by default — an owner
      // who hasn't enabled this keeps the plain fallback message, no status
      // change, no notification. Decided before anything is appended below.
      const isHandoff =
        !!chatbot.humanHandoff && (reply === chatbot.fallbackMessage || this.looksLikeHumanRequest(message));

      // The team can only follow up if they know how to reach the customer.
      // WhatsApp already gives us the phone number; on the website or
      // Instagram, ask for it whenever the chat is handed over while we
      // still have neither a phone nor an email — unless the bot already
      // asked earlier in this conversation (then only again when they
      // explicitly ask for a person).
      const alreadyAsked = conversation.messages.some(
        (m) => m.role === 'assistant' && CONTACT_REQUESTS.some((q) => m.content.includes(q)),
      );
      if (
        isHandoff &&
        !conversation.visitorPhone &&
        !conversation.visitorEmail &&
        (!alreadyAsked || this.looksLikeHumanRequest(message))
      ) {
        reply = `${reply}\n\n${this.contactRequest(chatbot, message)}`;
      }

      // 9. Add assistant reply
      conversation.messages.push({ role: 'assistant', content: reply, timestamp: new Date() });

      // 10. Try to capture lead contact details from what the customer just
      // shared — every tier gets this (not gated by billing.tier), since a
      // Basic-plan client following up manually needs a real phone/email
      // just as much as a Pro one. Stops running once all three are known.
      if (apiKey && (!conversation.visitorName || !conversation.visitorEmail || !conversation.visitorPhone)) {
        const extracted = await this.extractLeadInfo(
          chatProvider,
          apiKey,
          history.map((m) => ({ role: m.role, content: m.content })),
          {
            name: conversation.visitorName,
            email: conversation.visitorEmail,
            phone: conversation.visitorPhone,
          },
        );
        if (extracted.name) conversation.visitorName = extracted.name;
        if (extracted.email) conversation.visitorEmail = extracted.email;
        if (extracted.phone) conversation.visitorPhone = extracted.phone;
      }

      if (isHandoff && conversation.status !== 'handoff') {
        conversation.status = 'handoff';
      }

      await conversation.save();

      // 11. First time this conversation has a real contact method, notify
      // the owner — fire-and-forget, never blocks or fails the reply.
      if ((conversation.visitorPhone || conversation.visitorEmail) && !conversation.leadNotifiedAt) {
        conversation.leadNotifiedAt = new Date();
        this.notifyLead(chatbot, conversation, message).catch((err) =>
          this.logger.error(`Lead notification failed for embedKey=${embedKey}: ${err?.message}`),
        );
        await conversation.save();
      }

      // 12. First time this conversation escalates, notify the owner too —
      // independent of the lead notification above (a handoff can happen
      // with or without contact details already captured).
      if (isHandoff && !conversation.handoffNotifiedAt) {
        conversation.handoffNotifiedAt = new Date();
        this.notifyHandoff(chatbot, conversation, message).catch((err) =>
          this.logger.error(`Handoff notification failed for embedKey=${embedKey}: ${err?.message}`),
        );
        await conversation.save();
      }

      return { reply, sessionId, handoff: isHandoff };
    } catch (err) {
      this.logger.error(`chat() failed for embedKey=${embedKey}: ${err?.message}`, err?.stack);
      // This is caught here and never rethrown — the customer always gets
      // the fallback message — so it would otherwise never reach
      // SentryGlobalFilter at all. Tag explicitly with the bot (not the
      // anonymous customer, who has no identity here) so this is
      // attributable to a specific tenant instead of a silent console line.
      Sentry.captureException(err, {
        tags: {
          chatbotId: String(chatbot._id),
          tenantUserId: String(chatbot.userId),
          embedKey,
          channel,
        },
      });
      // Fallback on any error
      const fallback = chatbot.fallbackMessage;
      conversation.messages.push({ role: 'assistant', content: fallback, timestamp: new Date() });
      await conversation.save();
      return { reply: fallback, sessionId, handoff: false };
    }
  }

  // Meta's webhook handshake (GET ?hub.mode=subscribe&hub.verify_token=…&
  // hub.challenge=…). Only succeeds when the token matches this bot's own
  // random verifyToken for that channel; marks the channel verified.
  async verifyMetaWebhook(
    channel: 'whatsapp' | 'instagram',
    embedKey: string,
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string | null> {
    if (mode !== 'subscribe' || !token) return null;
    const filter = { ...CHATBOT_FILTER, isDeleted: false, 'config.embedKey': embedKey };
    const row = await this.chatbotModel.findOne(filter).select('config.channels').lean();
    const expected = (row?.config?.channels as any)?.[channel]?.verifyToken;
    if (!expected || !safeEqual(token, expected)) return null;
    await this.chatbotModel.updateOne(filter, { $set: { [`config.channels.${channel}.webhookVerified`]: true } });
    return challenge;
  }

  // X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(appSecret, raw body).
  private verifyMetaSignature(appSecret: string, rawBody: Buffer | undefined, header: string | undefined): boolean {
    if (!rawBody || !header?.startsWith('sha256=')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return safeEqual(header, expected);
  }

  // WhatsApp/Instagram are Pro-and-up channels. A message for a bot that
  // isn't on Pro, or whose channel isn't switched on and configured, is
  // ignored outright — no AI call (it would spend the owner's BYOK credits),
  // no conversation, no lead.
  private async loadMetaChannel(embedKey: string, channel: 'whatsapp' | 'instagram') {
    const { chatbot } = await this.findBot(embedKey);
    const cfg: any = chatbot?.channels?.[channel];
    const idField = channel === 'whatsapp' ? 'phoneNumberId' : 'accountId';
    if (!chatbot || chatbot.billing?.tier === 'basic' || !cfg?.enabled || !cfg[idField] || !cfg.accessToken || !cfg.appSecret) {
      this.logger.warn(`Ignoring ${channel} message for embedKey=${embedKey}: channel not available on this chatbot`);
      return null;
    }
    return { chatbot, id: cfg[idField] as string, accessToken: cfg.accessToken as string, appSecret: cfg.appSecret as string };
  }

  // Sends the bot's reply back through Meta. Before this existed the
  // webhooks computed a reply and dropped it — guests never got an answer.
  private async sendMetaReply(
    channel: 'whatsapp' | 'instagram',
    target: { chatbot: any; id: string; accessToken: string; appSecret: string },
    to: string,
    text: string,
  ) {
    const url = channel === 'whatsapp'
      ? `https://graph.facebook.com/v21.0/${target.id}/messages`
      : `https://graph.instagram.com/v21.0/${target.id}/messages`;
    const body = channel === 'whatsapp'
      ? { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } }
      : { recipient: { id: to }, message: { text } };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${target.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Meta ${channel} send failed: ${res.status} ${await res.text()}`);
    } catch (err) {
      this.logger.error(`Could not send ${channel} reply for chatbot ${target.chatbot._id}: ${(err as Error).message}`);
      Sentry.captureException(err, {
        tags: { chatbotId: String(target.chatbot._id), tenantUserId: String(target.chatbot.userId), channel },
      });
    }
  }

  // Returns false when the request is not genuinely from Meta (bad or
  // missing signature) — the controller answers 403. Everything else,
  // including channels that aren't available, is a quiet 200 so Meta
  // doesn't keep retrying.
  async handleWhatsappWebhook(embedKey: string, body: any, rawBody?: Buffer, signature?: string): Promise<boolean> {
    try {
      const target = await this.loadMetaChannel(embedKey, 'whatsapp');
      if (!target) return true;
      if (!this.verifyMetaSignature(target.appSecret, rawBody, signature)) {
        this.logger.warn(`Rejected WhatsApp webhook for embedKey=${embedKey}: invalid signature`);
        return false;
      }

      const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
      if (!messages?.length) return true; // status updates (delivered/read) carry no messages

      for (const msg of messages) {
        if (msg.type !== 'text') continue;
        const from = msg.from; // the guest's WhatsApp number — also the sessionId
        const text = msg.text?.body || '';
        if (!from || !text) continue;
        const { reply } = await this.chat(embedKey, from, text, 'whatsapp');
        if (reply) await this.sendMetaReply('whatsapp', target, from, reply);
      }
    } catch (err) {
      // Meta retries non-200s, so never throw back at the webhook.
      this.logger.error(`WhatsApp webhook error for embedKey=${embedKey}: ${(err as Error).message}`);
    }
    return true;
  }

  async handleInstagramWebhook(embedKey: string, body: any, rawBody?: Buffer, signature?: string): Promise<boolean> {
    try {
      const target = await this.loadMetaChannel(embedKey, 'instagram');
      if (!target) return true;
      if (!this.verifyMetaSignature(target.appSecret, rawBody, signature)) {
        this.logger.warn(`Rejected Instagram webhook for embedKey=${embedKey}: invalid signature`);
        return false;
      }

      const messaging = body?.entry?.[0]?.messaging?.[0];
      const senderId = messaging?.sender?.id;
      const text = messaging?.message?.text;
      // is_echo = a message the business account itself sent; never reply to it
      if (!senderId || !text || messaging?.message?.is_echo) return true;

      const { reply } = await this.chat(embedKey, senderId, text, 'instagram');
      if (reply) await this.sendMetaReply('instagram', target, senderId, reply);
    } catch (err) {
      this.logger.error(`Instagram webhook error for embedKey=${embedKey}: ${(err as Error).message}`);
    }
    return true;
  }
}
