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

// The self-serve pricing catalog for chatbots (Starter/Growth/Business/Agency-style
// tiers). A plan controls what a customer can enable (channelsAllowed), how many
// bots they can run (maxBots), and the fee + trial length applied automatically
// when a chatbot is created against it. Existing hand-negotiated deals keep working
// unassigned to any plan — planId on Chatbot.billing is optional, and enforcement
// (see ChatbotsService.update) only kicks in once a plan is actually assigned.
@Schema({ timestamps: true })
export class ChatbotPlan {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

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
}

export const ChatbotPlanSchema = SchemaFactory.createForClass(ChatbotPlan);
ChatbotPlanSchema.index({ slug: 1 }, { unique: true });
