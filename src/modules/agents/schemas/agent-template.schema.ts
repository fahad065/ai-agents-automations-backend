import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentTemplateDocument = AgentTemplate & Document;

export enum AgentCategory {
  YOUTUBE = 'youtube',
  FITNESS = 'fitness',
  MARKETING = 'marketing',
  ECOMMERCE = 'ecommerce',
  EDUCATION = 'education',
  CUSTOM = 'custom',
}

@Schema({ _id: false })
export class HeroStat {
  @Prop() label: string;
  @Prop() value: string;
}

@Schema({ _id: false })
export class AgentFeature {
  @Prop() title: string;
  @Prop() description: string;
  @Prop() icon: string;
}

@Schema({ _id: false })
export class HowItWorksStep {
  @Prop() step: string;
  @Prop() title: string;
  @Prop() description: string;
}

@Schema({ _id: false })
export class AgentTestimonial {
  @Prop() name: string;
  @Prop() role: string;
  @Prop() avatar: string;
  @Prop() text: string;
  @Prop() rating: number;
}

@Schema({ _id: false })
export class AgentPricing {
  @Prop() monthly: number;
  @Prop() annual: number;
  @Prop({ type: [String], default: [] }) features: string[];
}

@Schema({ _id: false })
export class AgentFaq {
  @Prop() question: string;
  @Prop() answer: string;
}

@Schema({ timestamps: true })
export class AgentTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  description: string;

  @Prop()
  tagline: string;

  @Prop({ enum: AgentCategory, required: true })
  category: AgentCategory;

  @Prop({ type: Object, default: {} })
  defaultConfig: Record<string, any>;

  @Prop({ type: [String], default: [] })
  capabilities: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  icon?: string;

  @Prop()
  color?: string;

  @Prop({ default: 'Coming soon' })
  badge: string;

  // Detail page fields
  @Prop({ type: [Object], default: [] })
  heroStats: HeroStat[];

  @Prop({ type: [Object], default: [] })
  features: AgentFeature[];

  @Prop({ type: [Object], default: [] })
  howItWorks: HowItWorksStep[];

  @Prop({ type: [Object], default: [] })
  testimonials: AgentTestimonial[];

  @Prop({ type: Object })
  pricing: AgentPricing;

  @Prop({ type: [Object], default: [] })
  faq: AgentFaq[];

  @Prop()
  demoVideoUrl?: string;

  // Stats updated by pipeline
  @Prop({ default: 0 })
  totalVideosGenerated: number;

  @Prop({ default: 0 })
  totalUsersCount: number;
}

export const AgentTemplateSchema = SchemaFactory.createForClass(AgentTemplate);

AgentTemplateSchema.index({ slug: 1 }, { unique: true });
AgentTemplateSchema.index({ isActive: 1 });