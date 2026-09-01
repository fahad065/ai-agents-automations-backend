import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotPlan, ChatbotPlanDocument } from './schemas/chatbot-plan.schema';

const DEFAULT_PLANS: Partial<ChatbotPlan>[] = [
  {
    name: 'Starter',
    slug: 'starter',
    tagline: 'Try the AI chatbot on your website',
    setupFee: 0,
    monthlyFee: 29,
    currency: 'USD',
    trialDays: 30,
    maxBots: 1,
    channelsAllowed: { website: true, whatsapp: false, instagram: false },
    features: ['1 chatbot', 'Website widget', 'Knowledge base (FAQ/Text/URL)', 'Basic analytics'],
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Growth',
    slug: 'growth',
    tagline: 'Add WhatsApp and Instagram to the conversation',
    setupFee: 0,
    monthlyFee: 49,
    currency: 'USD',
    trialDays: 30,
    maxBots: 1,
    channelsAllowed: { website: true, whatsapp: true, instagram: true },
    features: ['1 chatbot', 'Website + WhatsApp + Instagram', 'Human handoff', 'Basic analytics'],
    sortOrder: 2,
    isActive: true,
  },
  {
    name: 'Business',
    slug: 'business',
    tagline: 'Run multiple bots across your business',
    setupFee: 0,
    monthlyFee: 99,
    currency: 'USD',
    trialDays: 30,
    maxBots: 3,
    channelsAllowed: { website: true, whatsapp: true, instagram: true },
    features: ['Up to 3 chatbots', 'Website + WhatsApp + Instagram', 'Human handoff', 'Priority support'],
    sortOrder: 3,
    isActive: true,
  },
  {
    name: 'Agency',
    slug: 'agency',
    tagline: 'Unlimited bots for agencies and franchises',
    setupFee: 0,
    monthlyFee: 299,
    currency: 'USD',
    trialDays: 30,
    maxBots: 999,
    channelsAllowed: { website: true, whatsapp: true, instagram: true },
    features: ['Unlimited chatbots', 'Website + WhatsApp + Instagram', 'Human handoff', 'Priority support'],
    sortOrder: 4,
    isActive: true,
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
