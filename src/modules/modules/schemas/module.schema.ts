import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ModuleDocument = ModuleTemplate & Document;

export enum ModuleType {
  AGENT      = 'agent',
  AUTOMATION = 'automation',
  CHATBOT    = 'chatbot',
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
  YOUTUBE          = 'youtube',
  INSTAGRAM        = 'instagram',
  PODCAST          = 'podcast',
  REALESTATE       = 'realestate',
  HEALTHCARE       = 'healthcare',
  HR               = 'hr',
  ECOMMERCE        = 'ecommerce',
  MARKETING        = 'marketing',
  HOSPITALITY      = 'hospitality',
  EDUCATION        = 'education',
  LOGISTICS        = 'logistics',
  AGRICULTURE      = 'agriculture',
  FINANCE          = 'finance',
  INTERNAL_COPILOT = 'internal_copilot',
  SOCIAL           = 'social',
  LEADS            = 'leads',
  CUSTOM           = 'custom',
}

export enum PipelineCategory {
  STANDALONE      = 'standalone',       // runs as its own independent pipeline (e.g. YouTube Agent)
  NICHE_PIPELINE  = 'niche_pipeline',   // multi-component pipeline (e.g. Real Estate Pipeline)
}

export enum NicheSlug {
  CONTENT_SOCIAL   = 'content_social',
  REAL_ESTATE      = 'real_estate',
  HEALTHCARE       = 'healthcare',
  HR_RECRUITMENT   = 'hr_recruitment',
  ECOMMERCE_RETAIL = 'ecommerce_retail',
  MARKETING        = 'marketing',
  HOSPITALITY      = 'hospitality',
  EDUCATION        = 'education',
  LOGISTICS        = 'logistics',
  AGRICULTURE      = 'agriculture',
  FINANCE          = 'finance',
  INTERNAL_COPILOT = 'internal_copilot',
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
  @Prop({ type: [String], default: [] }) features_ar?: string[];
  @Prop({ default: false }) hasCustomPlan: boolean;
  @Prop({ default: "Contact us for custom pricing" }) customLabel: string;
  @Prop() customLabel_ar?: string;
}

// Chatbot-only, multi-tier pricing (Basic/Pro) — see backend CLAUDE.md's
// "Tiered chatbot pricing" section. Agents/automations keep the single
// ModulePricing plan above; a chatbot module carries BOTH: `pricing` stays
// set to the Basic tier's numbers (so anything still reading the old
// single-plan fields — the admin CMS form's Pricing tab, older code —
// keeps working unchanged) and `pricingTiers` is the new source of truth
// for tier-aware surfaces (chatbot-detail-page's 3-card pricing section,
// the config page's feature gating). The Custom/Enterprise tier has no
// fixed price — it reuses `pricing.hasCustomPlan`/`customLabel(_ar)`
// exactly as agents/automations already do for their "Contact us" card.
@Schema({ _id: false })
class PricingTier {
  @Prop({ required: true, enum: ['basic', 'pro'] }) key: string;
  @Prop({ default: 0 }) monthly: number;
  @Prop({ default: 0 }) annual: number;
  @Prop({ type: [String], default: [] }) features: string[];
  @Prop({ type: [String], default: [] }) features_ar?: string[];
}

@Schema({ _id: false })
class HeroStat {
  @Prop() label: string;
  @Prop() label_ar?: string;
  @Prop() value: string;
}

@Schema({ _id: false })
class ModuleFeature {
  @Prop() title: string;
  @Prop() title_ar?: string;
  @Prop() description: string;
  @Prop() description_ar?: string;
  @Prop() icon: string;
}

@Schema({ _id: false })
class HowItWorksStep {
  @Prop() step: string;
  @Prop() title: string;
  @Prop() title_ar?: string;
  @Prop() description: string;
  @Prop() description_ar?: string;
}

@Schema({ _id: false })
class ModuleFaq {
  @Prop() question: string;
  @Prop() question_ar?: string;
  @Prop() answer: string;
  @Prop() answer_ar?: string;
}

@Schema({ timestamps: true, collection: 'modules' })
export class ModuleTemplate {
  // ── Core identity ─────────────────────────────────────────
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  name_ar?: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop()
  description_ar?: string;

  @Prop()
  tagline?: string;

  @Prop()
  tagline_ar?: string;

  // ── Classification ────────────────────────────────────────
  @Prop({ enum: ModuleType, required: true, default: ModuleType.AGENT })
  moduleType: string;

  @Prop({ enum: ModuleCategory, default: ModuleCategory.CUSTOM })
  category: string;

  @Prop({ enum: PipelineType, default: PipelineType.CUSTOM })
  pipelineType: string;

  @Prop({ enum: OutputType, default: OutputType.VIDEO })
  outputType: string;

  // ── Country & Niche ───────────────────────────────────────
  @Prop({ type: [String], default: ['UAE', 'Kenya'] })
  availableIn: string[];   // which countries this module is available in

  @Prop({ enum: NicheSlug, default: NicheSlug.CONTENT_SOCIAL })
  nicheSlug: string;       // which niche this module belongs to

  @Prop({ enum: PipelineCategory, default: PipelineCategory.STANDALONE })
  pipelineCategory: string; // 'standalone' | 'niche_pipeline'

  // ── Niche pipeline components (only for pipelineCategory = niche_pipeline) ──
  @Prop({ type: [Object], default: [] })
  components: {
    key: string;           // e.g. 'whatsapp_agent'
    name: string;          // e.g. 'WhatsApp Lead Capture'
    description: string;
    icon: string;
    isRequired: boolean;   // if true, always enabled when subscribed
    sortOrder: number;
  }[];

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

  @Prop({ type: [String], default: [] })
  capabilities_ar: string[];

  @Prop({ type: Object, default: {} })
  defaultConfig: Record<string, any>;

  // ── Pricing ───────────────────────────────────────────────
  @Prop({ type: Object, default: { monthly: 0, annual: 0, features: [] } })
  pricing: ModulePricing;

  // Chatbot-only — see PricingTier above. Empty for agents/automations.
  @Prop({ type: [Object], default: [] })
  pricingTiers: PricingTier[];

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
ModuleSchema.index({ availableIn: 1 });
ModuleSchema.index({ nicheSlug: 1 });
ModuleSchema.index({ pipelineCategory: 1 });