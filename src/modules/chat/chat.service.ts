import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chatbot, ChatbotDocument } from '../chatbots/schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseDocument } from '../chatbots/schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from '../chatbots/schemas/conversation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyProvider } from '../api-keys/schemas/api-key.schema';
import { isChatbotBillingActive } from '../chatbots/billing-status.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../notifications/schemas/notification.schema';
import { EmailService } from '../email/email.service';

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private apiKeysService: ApiKeysService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  private async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });

    if (!response.ok) throw new Error(`OpenAI embeddings error: ${response.status}`);
    const data = await response.json() as any;
    return data.data[0].embedding as number[];
  }

  // LogicMate is bring-your-own-key: every chatbot owner must add their own
  // OpenAI key via Dashboard → API Keys before their bot can reply with AI.
  // No platform-wide fallback — each customer's usage is billed on their own key.
  private async resolveOpenAiKey(userId: string): Promise<string | null> {
    try {
      return await this.apiKeysService.getDecryptedKey(userId, ApiKeyProvider.OPENAI);
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(chatbot: ChatbotDocument, knowledgeSnippets: string[]): string {
    let languageInstruction = 'Respond in the same language the user writes in.';
    if (chatbot.language === 'en') languageInstruction = 'Only respond in English.';
    if (chatbot.language === 'ar') languageInstruction = 'Only respond in Arabic.';

    const knowledgeSection =
      knowledgeSnippets.length > 0
        ? `Knowledge base:\n${knowledgeSnippets.join('\n\n')}`
        : 'No knowledge base entries are available.';

    return `You are ${chatbot.name}, a helpful customer service assistant.
Persona: ${chatbot.persona || 'friendly and professional'}.
Language: ${languageInstruction}
IMPORTANT: Only answer questions based on the knowledge base below. If the question is not covered, say: "${chatbot.fallbackMessage}".
Do not make up information.

Whenever it's natural — especially if the customer wants to book, order, get a quote, or asks to be contacted — politely ask for their name, phone number and email if they haven't shared them yet. Weave this into the conversation over a message or two rather than demanding all three at once, and never block answering their actual question just to collect these details.

${knowledgeSection}`;
  }

  // Runs a second, cheap gpt-4o-mini call to pull structured contact details
  // out of whatever the customer just said — decoupled from the main reply
  // so it works regardless of how well the model follows the "ask for
  // contact info" instruction above. Only called while at least one of
  // name/email/phone is still missing, so it naturally stops once a lead
  // is fully captured instead of running on every message forever.
  private async extractLeadInfo(
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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 150,
          messages: [
            {
              role: 'system',
              content: `Extract the customer's own contact details from this chat, if shared. Return strict JSON: {"name": string|null, "email": string|null, "phone": string|null}. Only include a field the customer explicitly stated about themselves — never guess, infer, or invent one. Normalize phone numbers to digits with an optional leading "+". Still missing: ${missing.join(', ')}.`,
            },
            ...recentMessages,
          ],
        }),
      });
      if (!response.ok) return {};
      const data = (await response.json()) as any;
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
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
    chatbot: ChatbotDocument,
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
      },
    );
  }

  async chat(
    embedKey: string,
    sessionId: string,
    message: string,
    channel: 'website' | 'whatsapp' | 'instagram' = 'website',
  ): Promise<{ reply: string; sessionId: string; handoff: boolean }> {
    // 1. Find chatbot
    const chatbot = await this.chatbotModel.findOne({ embedKey });
    if (!chatbot || chatbot.status !== 'active') {
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
    if (!isChatbotBillingActive(chatbot)) {
      return {
        reply: chatbot.fallbackMessage,
        sessionId,
        handoff: false,
      };
    }

    // 2. Find or create conversation
    let conversation = await this.conversationModel.findOne({ chatbotId: chatbot._id, sessionId });
    if (!conversation) {
      conversation = await this.conversationModel.create({
        chatbotId: chatbot._id,
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
      // 4. Get the bot owner's own OpenAI key (BYOK — no platform fallback)
      const userId = chatbot.userId.toString();
      const apiKey = await this.resolveOpenAiKey(userId);
      if (!apiKey) {
        this.logger.warn(`No OpenAI key on file for chatbot owner — returning fallbackMessage for embedKey=${embedKey}`);
      }

      // 5. Retrieve knowledge entries
      const allKnowledge = await this.knowledgeBaseModel
        .find({ chatbotId: chatbot._id })
        .select('+embedding');

      let knowledgeSnippets: string[] = [];

      if (apiKey && allKnowledge.length > 0) {
        // Get embeddings for knowledge with vectors
        const knowledgeWithEmbeddings = allKnowledge.filter(
          (k) => k.embedding && k.embedding.length > 0,
        );

        if (knowledgeWithEmbeddings.length > 0) {
          try {
            const queryEmbedding = await this.getEmbedding(message, apiKey);

            // Find top 4 by cosine similarity
            const scored = knowledgeWithEmbeddings
              .map((k) => ({ entry: k, score: cosineSim(queryEmbedding, k.embedding) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 4);

            knowledgeSnippets = scored.map((s) => {
              const k = s.entry;
              if (k.type === 'faq') return `Q: ${k.question}\nA: ${k.answer}`;
              return k.content || '';
            });
          } catch {
            // Embedding failed — fall back to all knowledge (no ranking)
            knowledgeSnippets = allKnowledge.slice(0, 4).map((k) => {
              if (k.type === 'faq') return `Q: ${k.question}\nA: ${k.answer}`;
              return k.content || '';
            });
          }
        } else {
          // Knowledge exists but no embeddings
          knowledgeSnippets = allKnowledge.slice(0, 4).map((k) => {
            if (k.type === 'faq') return `Q: ${k.question}\nA: ${k.answer}`;
            return k.content || '';
          });
        }
      } else {
        knowledgeSnippets = allKnowledge.slice(0, 8).map((k) => {
          if (k.type === 'faq') return `Q: ${k.question}\nA: ${k.answer}`;
          return k.content || '';
        });
      }

      const systemPrompt = this.buildSystemPrompt(chatbot, knowledgeSnippets);

      // 6. Build conversation history (last 10 messages)
      const history = conversation.messages.slice(-10);
      const openAiMessages = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];

      let reply = chatbot.fallbackMessage;

      if (apiKey) {
        // 7. Call OpenAI
        const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: openAiMessages,
            max_tokens: 512,
            temperature: 0.7,
          }),
        });

        if (completionResponse.ok) {
          const completionData = await completionResponse.json() as any;
          reply = completionData.choices?.[0]?.message?.content?.trim() || chatbot.fallbackMessage;
        } else {
          const errBody = await completionResponse.text();
          this.logger.error(`OpenAI chat completion failed (${completionResponse.status}): ${errBody}`);
        }
      }

      // 8. Add assistant reply
      conversation.messages.push({ role: 'assistant', content: reply, timestamp: new Date() });

      // 9. Try to capture lead contact details from what the customer just
      // shared — every tier gets this (not gated by billing.tier), since a
      // Basic-plan client following up manually needs a real phone/email
      // just as much as a Pro one. Stops running once all three are known.
      if (apiKey && (!conversation.visitorName || !conversation.visitorEmail || !conversation.visitorPhone)) {
        const extracted = await this.extractLeadInfo(
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

      await conversation.save();

      // 10. First time this conversation has a real contact method, notify
      // the owner — fire-and-forget, never blocks or fails the reply.
      if ((conversation.visitorPhone || conversation.visitorEmail) && !conversation.leadNotifiedAt) {
        conversation.leadNotifiedAt = new Date();
        this.notifyLead(chatbot, conversation, message).catch((err) =>
          this.logger.error(`Lead notification failed for embedKey=${embedKey}: ${err?.message}`),
        );
        await conversation.save();
      }

      return { reply, sessionId, handoff: false };
    } catch (err) {
      this.logger.error(`chat() failed for embedKey=${embedKey}: ${err?.message}`, err?.stack);
      // Fallback on any error
      const fallback = chatbot.fallbackMessage;
      conversation.messages.push({ role: 'assistant', content: fallback, timestamp: new Date() });
      await conversation.save();
      return { reply: fallback, sessionId, handoff: false };
    }
  }

  // WhatsApp webhook verification
  verifyWhatsappWebhook(
    mode: string,
    token: string,
    challenge: string,
    embedKey: string,
  ): string | null {
    // Find the chatbot's verifyToken from DB asynchronously is not possible here
    // For now verify by confirming mode === 'subscribe' and return challenge
    if (mode === 'subscribe') {
      return challenge;
    }
    return null;
  }

  async handleWhatsappWebhook(embedKey: string, body: any): Promise<void> {
    try {
      // Extract message from WhatsApp webhook payload
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;

      if (!messages || !messages.length) return;

      for (const msg of messages) {
        if (msg.type !== 'text') continue;
        const from = msg.from; // WhatsApp phone number as sessionId
        const text = msg.text?.body || '';
        if (!text) continue;
        await this.chat(embedKey, from, text, 'whatsapp');
      }
    } catch {
      // Silently handle webhook errors
    }
  }

  // Instagram webhook verification
  verifyInstagramWebhook(
    mode: string,
    token: string,
    challenge: string,
    embedKey: string,
  ): string | null {
    if (mode === 'subscribe') {
      return challenge;
    }
    return null;
  }

  async handleInstagramWebhook(embedKey: string, body: any): Promise<void> {
    try {
      // Extract DM from Instagram webhook payload
      const entry = body?.entry?.[0];
      const messaging = entry?.messaging?.[0];
      if (!messaging) return;

      const senderId = messaging?.sender?.id;
      const text = messaging?.message?.text;
      if (!senderId || !text) return;

      await this.chat(embedKey, senderId, text, 'instagram');
    } catch {
      // Silently handle webhook errors
    }
  }
}
