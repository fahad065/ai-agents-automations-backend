import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ModuleDocument = ModuleTemplate & Document;

export enum ModuleType {
  AGENT      = 'agent',
  AUTOMATION = 'automation',
}

export enum ModuleCategory {
  YOUTUBE    = 'youtube',
  PODCAST    = 'podcast',
  MARKETING  = 'marketing',
  REALESTATE = 'realestate',
  ECOMMERCE  = 'ecommerce',
  EDUCATION  = 'education',
  FITNESS    = 'fitness',
  SOCIAL     = 'social',
  LEADS      = 'leads',
  CUSTOM     = 'custom',
}

export enum PipelineType {
  YOUTUBE    = 'youtube',
  PODCAST    = 'podcast',
  REALESTATE = 'realestate',
  MARKETING  = 'marketing',
  SOCIAL     = 'social',
  LEADS      = 'leads',
  CUSTOM     = 'custom',
}

export enum OutputType {
  VIDEO       = 'video',
  AUDIO       = 'audio',
  TEXT        = 'text',
  EMAIL       = 'email',
  SOCIAL_POST = 'social_post',
  REPORT      = 'report',
}

@Schema({ _id: false })
class ModulePricing {
  @Prop({ default: 0 }) monthly: number;
  @Prop({ default: 0 }) annual: number;
  @Prop({ type: [String], default: [] }) features: string[];
}

@Schema({ _id: false })
class HeroStat {
  @Prop() label: string;
  @Prop() value: string;
}

@Schema({ _id: false })
class ModuleFeature {
  @Prop() title: string;
  @Prop() description: string;
  @Prop() icon: string;
}

@Schema({ _id: false })
class HowItWorksStep {
  @Prop() step: string;
  @Prop() title: string;
  @Prop() description: string;
}

@Schema({ _id: false })
class ModuleFaq {
  @Prop() question: string;
  @Prop() answer: string;
}

@Schema({ timestamps: true, collection: 'modules' })
export class ModuleTemplate {
  // ── Core identity ─────────────────────────────────────────
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop()
  tagline?: string;

  // ── Classification ────────────────────────────────────────
  @Prop({ enum: ModuleType, required: true, default: ModuleType.AGENT })
  moduleType: string;

  @Prop({ enum: ModuleCategory, default: ModuleCategory.CUSTOM })
  category: string;

  @Prop({ enum: PipelineType, default: PipelineType.CUSTOM })
  pipelineType: string;

  @Prop({ enum: OutputType, default: OutputType.VIDEO })
  outputType: string;

  // ── Display ───────────────────────────────────────────────
  @Prop({ default: '🤖' })
  icon: string;

  @Prop({ default: '#7c3aed' })
  color: string;

  @Prop({ default: 'New' })
  badge: string;

  @Prop({ default: 0 })
  sortOrder: number;

  // ── Status ────────────────────────────────────────────────
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isComingSoon: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  // ── Technical ─────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  requiredApiKeys: string[];

  @Prop()
  estimatedCostPerRun?: string;

  @Prop({ type: [String], default: [] })
  platforms: string[];

  @Prop({ type: [String], default: [] })
  capabilities: string[];

  @Prop({ type: Object, default: {} })
  defaultConfig: Record<string, any>;

  // ── Pricing ───────────────────────────────────────────────
  @Prop({ type: Object, default: { monthly: 0, annual: 0, features: [] } })
  pricing: ModulePricing;

  // ── Marketplace content ───────────────────────────────────
  @Prop({ type: [Object], default: [] })
  heroStats: HeroStat[];

  @Prop({ type: [Object], default: [] })
  features: ModuleFeature[];

  @Prop({ type: [Object], default: [] })
  howItWorks: HowItWorksStep[];

  @Prop({ type: [Object], default: [] })
  faq: ModuleFaq[];

  @Prop()
  demoVideoUrl?: string;

  // ── Live stats ────────────────────────────────────────────
  @Prop({ default: 0 }) totalUsersCount: number;
  @Prop({ default: 0 }) totalRunsCount: number;
  @Prop({ default: 0 }) avgCostPerRun: number;
}

export const ModuleSchema = SchemaFactory.createForClass(ModuleTemplate);

ModuleSchema.index({ moduleType: 1 });
ModuleSchema.index({ category: 1 });
ModuleSchema.index({ isActive: 1 });
ModuleSchema.index({ isDeleted: 1 });
ModuleSchema.index({ sortOrder: 1 });