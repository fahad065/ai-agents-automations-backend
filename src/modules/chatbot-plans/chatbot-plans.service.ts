import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotPlan, ChatbotPlanDocument } from './schemas/chatbot-plan.schema';

// Per-template market pricing — not one flat price for every vertical.
// Reasoning per template (rough market judgment, adjust freely via the
// admin catalog — this is a starting point, not a fixed law):
//   restaurant-chatbot: high-volume, price-sensitive SMBs, low value per
//     individual interaction (a reservation, a menu question) -> cheapest tier.
//   real-estate-chatbot: a single qualified lead can be worth thousands in
//     commission -> priced highest of the six.
//   clinic-chatbot: appointment/no-show value and healthcare context command
//     a premium over retail-style bots.
//   ecommerce-chatbot: high ticket volume and thin margins, but real support
//     cost offset -> mid-low.
//   gym-chatbot: subscription business, moderate ticket size -> same band as
//     restaurant.
//   education-chatbot: enrolment/course value can be substantial, admissions
//     season leads are high-value -> same band as clinic.
// Enterprise is always isCustom (no fixed price, "Contact us") regardless of
// template — a multi-location/white-label deal is negotiated, not catalog priced.
function tiersFor(templateSlug: string, basicFee: number, proFee: number) {
  return [
    {
      name: 'Basic', slug: 'basic', templateSlug,
      tagline: 'Get the AI chatbot live on your website',
      setupFee: 0, monthlyFee: basicFee, currency: 'USD', trialDays: 30, maxBots: 1,
      channelsAllowed: { website: true, whatsapp: false, instagram: false },
      features: ['1 chatbot', 'Website widget', 'Knowledge base (FAQ/Text/URL)', 'Basic analytics', 'Dashboard access'],
      sortOrder: 1, isActive: true, isCustom: false,
    },
    {
      name: 'Pro', slug: 'pro', templateSlug,
      tagline: 'Add WhatsApp and Instagram to the conversation',
      setupFee: 0, monthlyFee: proFee, currency: 'USD', trialDays: 30, maxBots: 1,
      channelsAllowed: { website: true, whatsapp: true, instagram: true },
      features: ['1 chatbot', 'Website + WhatsApp + Instagram', 'Human handoff', 'Full analytics', 'Dashboard access'],
      sortOrder: 2, isActive: true, isCustom: false,
    },
    {
      name: 'Enterprise', slug: 'enterprise', templateSlug,
      tagline: 'Multiple bots, custom integrations, dedicated support',
      setupFee: 0, monthlyFee: 0, currency: 'USD', trialDays: 30, maxBots: 999,
      channelsAllowed: { website: true, whatsapp: true, instagram: true },
      features: ['Multiple chatbots', 'Website + WhatsApp + Instagram', 'Human handoff', 'Priority support', 'Custom integrations', 'Dedicated onboarding'],
      sortOrder: 3, isActive: true, isCustom: true,
      customLabel: 'Need multiple locations, custom integrations, or a white-label solution?',
    },
  ];
}

const DEFAULT_PLANS: Partial<ChatbotPlan>[] = [
  ...tiersFor('restaurant-chatbot', 29, 49),
  ...tiersFor('real-estate-chatbot', 49, 89),
  ...tiersFor('clinic-chatbot', 39, 69),
  ...tiersFor('ecommerce-chatbot', 29, 59),
  ...tiersFor('gym-chatbot', 29, 49),
  ...tiersFor('education-chatbot', 39, 69),
];

@Injectable()
export class ChatbotPlansService {
  constructor(
    @InjectModel(ChatbotPlan.name) private planModel: Model<ChatbotPlanDocument>,
  ) {}

  // Public catalog — only plans meant to be sold right now. Pass a
  // templateSlug to get just that template's 3 tiers (the normal case, used
  // by the detail page); omit it to get every plan across every template
  // (used by the standalone /pricing page to compute each template's
  // starting price).
  findActive(templateSlug?: string): Promise<ChatbotPlanDocument[]> {
    const filter: any = { isActive: true };
    if (templateSlug) filter.templateSlug = templateSlug;
    return this.planModel.find(filter).sort({ templateSlug: 1, sortOrder: 1 });
  }

  // Admin catalog — everything, including retired plans (existing customers
  // may still be assigned to one).
  findAllAdmin(): Promise<ChatbotPlanDocument[]> {
    return this.planModel.find().sort({ templateSlug: 1, sortOrder: 1 });
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

  // Upserts the 18 default tiers (6 templates x Basic/Pro/Enterprise) by
  // (templateSlug, slug) — safe to re-run, and safe to extend with a new
  // template later without wiping admin edits to existing plans. Mirrors the
  // SEED_MODULES upsert pattern in modules.service.ts rather than the old
  // "only if the catalog is empty" all-or-nothing seed.
  async seedDefaults(): Promise<{ inserted: number }> {
    let inserted = 0;
    for (const plan of DEFAULT_PLANS) {
      const result = await this.planModel.updateOne(
        { templateSlug: plan.templateSlug, slug: plan.slug },
        { $setOnInsert: plan },
        { upsert: true },
      );
      if (result.upsertedCount) inserted++;
    }
    return { inserted };
  }
}
