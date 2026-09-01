import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotPlan, ChatbotPlanDocument } from './schemas/chatbot-plan.schema';

const DEFAULT_PLANS: Partial<ChatbotPlan>[] = [
  {
    name: 'Basic',
    slug: 'basic',
    tagline: 'Get the AI chatbot live on your website',
    setupFee: 0,
    monthlyFee: 29,
    currency: 'USD',
    trialDays: 30,
    maxBots: 1,
    channelsAllowed: { website: true, whatsapp: false, instagram: false },
    features: ['1 chatbot', 'Website widget', 'Knowledge base (FAQ/Text/URL)', 'Basic analytics', 'Dashboard access'],
    sortOrder: 1,
    isActive: true,
    isCustom: false,
  },
  {
    name: 'Pro',
    slug: 'pro',
    tagline: 'Add WhatsApp and Instagram to the conversation',
    setupFee: 0,
    monthlyFee: 49,
    currency: 'USD',
    trialDays: 30,
    maxBots: 1,
    channelsAllowed: { website: true, whatsapp: true, instagram: true },
    features: ['1 chatbot', 'Website + WhatsApp + Instagram', 'Human handoff', 'Full analytics', 'Dashboard access'],
    sortOrder: 2,
    isActive: true,
    isCustom: false,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    tagline: 'Multiple bots, custom integrations, dedicated support',
    setupFee: 0,
    monthlyFee: 0,
    currency: 'USD',
    trialDays: 30,
    maxBots: 999,
    channelsAllowed: { website: true, whatsapp: true, instagram: true },
    features: ['Multiple chatbots', 'Website + WhatsApp + Instagram', 'Human handoff', 'Priority support', 'Custom integrations', 'Dedicated onboarding'],
    sortOrder: 3,
    isActive: true,
    isCustom: true,
    customLabel: 'Need multiple locations, custom integrations, or a white-label solution?',
  },
];

@Injectable()
export class ChatbotPlansService {
  constructor(
    @InjectModel(ChatbotPlan.name) private planModel: Model<ChatbotPlanDocument>,
  ) {}

  // Public catalog — only plans meant to be sold right now.
  findActive(): Promise<ChatbotPlanDocument[]> {
    return this.planModel.find({ isActive: true }).sort({ sortOrder: 1 });
  }

  // Admin catalog — everything, including retired plans (existing customers
  // may still be assigned to one).
  findAllAdmin(): Promise<ChatbotPlanDocument[]> {
    return this.planModel.find().sort({ sortOrder: 1 });
  }

  findById(id: string): Promise<ChatbotPlanDocument | null> {
    return this.planModel.findById(id);
  }

  create(dto: Partial<ChatbotPlan>): Promise<ChatbotPlanDocument> {
    return this.planModel.create(dto);
  }

  async update(id: string, dto: Partial<ChatbotPlan>): Promise<ChatbotPlanDocument> {
    const plan = await this.planModel.findById(id);
    if (!plan) throw new NotFoundException('Plan not found');
    Object.assign(plan, dto);
    return plan.save();
  }

  async delete(id: string): Promise<{ message: string }> {
    const result = await this.planModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Plan not found');
    return { message: 'Plan deleted' };
  }

  // Seeds the four default global tiers, only if the catalog is empty —
  // mirrors CmsService.seedPages(), an explicit admin action rather than an
  // implicit onModuleInit side effect.
  async seedDefaults(): Promise<{ inserted: number }> {
    const count = await this.planModel.countDocuments();
    if (count > 0) return { inserted: 0 };
    const inserted = await this.planModel.insertMany(DEFAULT_PLANS);
    return { inserted: inserted.length };
  }
}
