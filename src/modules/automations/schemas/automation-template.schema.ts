import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AutomationTemplateDocument = AutomationTemplate & Document;

export enum AutomationCategory {
  CONTENT = 'content',
  SOCIAL = 'social',
  EMAIL = 'email',
  ECOMMERCE = 'ecommerce',
  REPURPOSING = 'repurposing',
  PODCAST = 'podcast',
}

@Schema({ _id: false })
export class AutomationStat {
  @Prop() label: string;
  @Prop() value: string;
}

@Schema({ _id: false })
export class AutomationFeature {
  @Prop() title: string;
  @Prop() description: string;
  @Prop() icon: string;
}

@Schema({ _id: false })
export class AutomationStep {
  @Prop() step: string;
  @Prop() title: string;
  @Prop() description: string;
}

@Schema({ _id: false })
export class AutomationTestimonial {
  @Prop() name: string;
  @Prop() role: string;
  @Prop() avatar: string;
  @Prop() text: string;
  @Prop() rating: number;
}

@Schema({ _id: false })
export class AutomationPricing {
  @Prop() monthly: number;
  @Prop() annual: number;
  @Prop({ type: [String], default: [] }) features: string[];
}

@Schema({ _id: false })
export class AutomationFaq {
  @Prop() question: string;
  @Prop() answer: string;
}

@Schema({ _id: false })
export class AutomationIntegration {
  @Prop() name: string;
  @Prop() icon: string;
  @Prop() description: string;
}

@Schema({ timestamps: true })
export class AutomationTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  tagline: string;

  @Prop()
  description: string;

  @Prop({ enum: AutomationCategory, required: true })
  category: AutomationCategory;

  @Prop()
  icon: string;

  @Prop()
  color: string;

  @Prop({ default: 'Coming soon' })
  badge: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  capabilities: string[];

  @Prop({ type: [Object], default: [] })
  heroStats: AutomationStat[];

  @Prop({ type: [Object], default: [] })
  features: AutomationFeature[];

  @Prop({ type: [Object], default: [] })
  howItWorks: AutomationStep[];

  @Prop({ type: [Object], default: [] })
  testimonials: AutomationTestimonial[];

  @Prop({ type: Object })
  pricing: AutomationPricing;

  @Prop({ type: [Object], default: [] })
  faq: AutomationFaq[];

  @Prop({ type: [Object], default: [] })
  integrations: AutomationIntegration[];

  @Prop()
  demoVideoUrl?: string;

  @Prop({ type: Object, default: {} })
  defaultConfig: Record<string, any>;

  @Prop({ default: 0 })
  totalUsersCount: number;
}

export const AutomationTemplateSchema = SchemaFactory.createForClass(AutomationTemplate);
AutomationTemplateSchema.index({ slug: 1 }, { unique: true });
AutomationTemplateSchema.index({ isActive: 1, category: 1 });