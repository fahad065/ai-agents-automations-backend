import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
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
import { ChatbotPlansService } from '../chatbot-plans/chatbot-plans.service';

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
export class ChatbotsService {
  private readonly logger = new Logger(ChatbotsService.name);

  constructor(
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel('User') private userModel: Model<any>,
    private apiKeysService: ApiKeysService,
    private billingService: BillingService,
    private emailService: EmailService,
    private plansService: ChatbotPlansService,
  ) {}

  // Every new chatbot starts a 30-day (or plan-defined) free trial automatically —
  // no admin step required. If `dto.planId` is set, the chatbot inherits that
  // plan's fees, currency and trial length so it's ready for self-serve signup;
  // omit it to keep today's hand-negotiated-deal flow (admin sets pricing later
  // via PUT /:id/pricing, trial length defaults to 30 days).
  async create(userId: string, dto: any): Promise<ChatbotDocument> {
    const embedKey = crypto.randomBytes(16).toString('hex');
    const { planId, ...rest } = dto;

    let trialDays = 30;
    const billing: any = {};

    if (planId) {
      const plan = await this.plansService.findById(planId);
      if (!plan) throw new NotFoundException('Plan not found');
      trialDays = plan.trialDays;
      billing.planId = plan._id;
      billing.setupFee = plan.setupFee;
      billing.monthlyFee = plan.monthlyFee;
      billing.currency = plan.currency;
    }

    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    billing.trialEndsAt = trialEndsAt;

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
          { moduleName: chatbot.name, trialEndDate: trialEndsAt },
        );
      }
    } catch (err) {
      this.logger.warn(`create() trial-started email failed for chatbot=${chatbot._id}: ${err?.message}`);
    }

    return chatbot;
  }

  async findAllByUser(userId: string): Promise<ChatbotDocument[]> {
    return this.chatbotModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async findOne(id: string, userId: string): Promise<ChatbotDocument> {
    const chatbot = await this.chatbotModel.findById(id);
    if (!chatbot) throw new NotFoundException('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new ForbiddenException('Access denied');
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
  // so admin can tell whose bot they're pricing.
  async findAllAdmin(): Promise<any[]> {
    return this.chatbotModel
      .find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(id: string, userId: string, dto: any): Promise<ChatbotDocument> {
    const chatbot = await this.findOne(id, userId);
    const changes = pickCustomerEditable(dto);

    // Plan-gated channels: only enforced once a plan is actually assigned
    // (billing.planId) — hand-negotiated deals with no plan keep working as
    // before. A customer on Starter (website only) can't self-enable WhatsApp
    // or Instagram by just PUTing channels.whatsapp.enabled = true.
    if (chatbot.billing?.planId && changes.channels) {
      const plan = await this.plansService.findById(chatbot.billing.planId.toString());
      if (plan) {
        if (changes.channels.whatsapp?.enabled && !plan.channelsAllowed.whatsapp) {
          throw new ForbiddenException(`WhatsApp is not included in the ${plan.name} plan — upgrade to enable it.`);
        }
        if (changes.channels.instagram?.enabled && !plan.channelsAllowed.instagram) {
          throw new ForbiddenException(`Instagram is not included in the ${plan.name} plan — upgrade to enable it.`);
        }
      }
    }

    Object.assign(chatbot, changes);
    return chatbot.save();
  }

  async delete(id: string, userId: string): Promise<{ message: string }> {
    const chatbot = await this.findOne(id, userId);
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

  async addKnowledge(chatbotId: string, userId: string, dto: any): Promise<KnowledgeBaseDocument> {
    // Verify ownership
    await this.findOne(chatbotId, userId);

    let embedding: number[] = [];

    try {
      const apiKey = await this.resolveOpenAiKey(userId);
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

  async listKnowledge(chatbotId: string, userId: string): Promise<KnowledgeBaseDocument[]> {
    await this.findOne(chatbotId, userId);
    return this.knowledgeBaseModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .select('-embedding')
      .sort({ createdAt: -1 });
  }

  async deleteKnowledge(chatbotId: string, knowledgeId: string, userId: string): Promise<{ message: string }> {
    await this.findOne(chatbotId, userId);
    const result = await this.knowledgeBaseModel.findOneAndDelete({
      _id: new Types.ObjectId(knowledgeId),
      chatbotId: new Types.ObjectId(chatbotId),
    });
    if (!result) throw new NotFoundException('Knowledge entry not found');
    return { message: 'Knowledge entry deleted' };
  }

  async getConversations(chatbotId: string, userId: string, limit = 20): Promise<ConversationDocument[]> {
    await this.findOne(chatbotId, userId);
    return this.conversationModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .sort({ createdAt: -1 })
      .limit(Number(limit));
  }

  async getAnalytics(chatbotId: string, userId: string): Promise<any> {
    await this.findOne(chatbotId, userId);

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

  async getEmbedCode(chatbotId: string, userId: string): Promise<{ embedCode: string }> {
    const chatbot = await this.findOne(chatbotId, userId);
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
    dto: { setupFee?: number; monthlyFee?: number; currency?: string; trialEndsAt?: string; notes?: string },
  ): Promise<ChatbotDocument> {
    const chatbot = await this.findOneAdmin(id);

    if (dto.setupFee !== undefined) chatbot.billing.setupFee = dto.setupFee;
    if (dto.monthlyFee !== undefined) chatbot.billing.monthlyFee = dto.monthlyFee;
    if (dto.currency !== undefined) chatbot.billing.currency = dto.currency;
    if (dto.trialEndsAt !== undefined) chatbot.billing.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.notes !== undefined) chatbot.billing.notes = dto.notes;

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
