import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatbotPlanDocument = ChatbotPlan & Document;

@Schema({ _id: false })
export class PlanChannels {
  @Prop({ default: true })
  website: boolean;

  @Prop({ default: false })
  whatsapp: boolean;

  @Prop({ default: false })
  instagram: boolean;
}

// The self-serve pricing catalog for chatbots — Basic/Pro/Enterprise tiers,
// priced per template (templateSlug) rather than one flat price for every
// vertical, since a qualified real-estate lead is worth a lot more than a
// restaurant reservation and pricing should reflect that. A plan controls
// what a customer can enable (channelsAllowed), how many bots they can run
// (maxBots), and the fee + trial length applied automatically when a chatbot
// is created against it. Existing hand-negotiated deals keep working
// unassigned to any plan — planId on Chatbot.billing is optional, and
// enforcement (see ChatbotsService.update) only kicks in once a plan is
// actually assigned.
@Schema({ timestamps: true })
export class ChatbotPlan {
  @Prop({ required: true })
  name: string;

  // Tier identifier within a template, e.g. 'basic' | 'pro' | 'enterprise'.
  // Not globally unique on its own — see the compound index below.
  @Prop({ required: true })
  slug: string;

  // Which chatbot template (ModuleTemplate.slug, e.g. 'restaurant-chatbot')
  // this tier's pricing applies to. Every plan belongs to exactly one
  // template — there is no more "one global catalog for every vertical".
  @Prop({ required: true })
  templateSlug: string;

  @Prop()
  tagline?: string;

  @Prop({ default: 0 })
  setupFee: number;

  @Prop({ required: true })
  monthlyFee: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: 30 })
  trialDays: number;

  @Prop({ default: 1 })
  maxBots: number;

  @Prop({ type: PlanChannels, default: () => ({}) })
  channelsAllowed: PlanChannels;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  // Custom/enterprise tier — rendered as a "Contact us" card with no fixed
  // price instead of a $/mo figure, same pattern as ModulePricing.hasCustomPlan
  // on the agents/automations detail pages.
  @Prop({ default: false })
  isCustom: boolean;

  @Prop({ default: 'Contact us for custom pricing' })
  customLabel: string;
}

export const ChatbotPlanSchema = SchemaFactory.createForClass(ChatbotPlan);
ChatbotPlanSchema.index({ templateSlug: 1, slug: 1 }, { unique: true });
