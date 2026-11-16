import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// The catalog — everything sellable, including bundles. Replaces the old
// `modules` (ModuleTemplate) collection. See ai/architecture.md's `services`
// section; the migration from `modules` lives in ServicesService.

export type ServiceDocument = Service & Document;

export enum ServiceType {
  AGENT = 'agent',
  AUTOMATION = 'automation',
  CHATBOT = 'chatbot',
  BUNDLE = 'bundle',
}

// One status enum instead of the old isActive + isComingSoon booleans,
// which allowed contradictory states (inactive AND coming soon).
export enum ServiceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  COMING_SOON = 'coming_soon',
}

export enum PipelineCategory {
  STANDALONE = 'standalone',
  NICHE_PIPELINE = 'niche_pipeline',
}

@Schema({ _id: false })
class ServicePricing {
  @Prop({ default: 0 }) monthly: number;
  @Prop({ default: 0 }) annual: number;
  @Prop({ type: [String], default: [] }) features: string[];
  @Prop({ type: [String], default: [] }) features_ar?: string[];
  @Prop({ default: false }) hasCustomPlan: boolean;
  @Prop({ default: 'Contact us for custom pricing' }) customLabel: string;
  @Prop() customLabel_ar?: string;
  // Chatbot-only Basic/Pro tiers (moved here from top-level pricingTiers).
  @Prop({ type: [Object], default: [] }) tiers?: PricingTier[];
  // Not wired to Stripe yet (rules.md #11).
  @Prop() stripePriceId?: string;
}

// Generic now — any type may use tiers, not just chatbots (today only the
// chatbot templates do: Basic/Pro, with Custom via pricing.hasCustomPlan).
@Schema({ _id: false })
class PricingTier {
  @Prop({ required: true }) key: string;
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
  @Prop() value_ar?: string; // e.g. "Instant" → "فوري"; falls back to value
}

// Marketing feature cards. Deliberately NOT named `features` — that name is
// already pricing.features[] (plan bullet strings), a different shape. They
// collided under one name in the old ModuleTemplate (rules.md #6).
@Schema({ _id: false })
class FeatureCard {
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
class ServiceFaq {
  @Prop() question: string;
  @Prop() question_ar?: string;
  @Prop() answer: string;
  @Prop() answer_ar?: string;
}

// Grouped sub-documents (2026-11-16, user-approved): marketing copy under
// `content`, SEO under `seo`, card styling under `display`, how the Python
// service runs it under `pipeline`, and all pricing (incl. chatbot tiers)
// under `pricing`. Old flat docs are migrated by
// ServicesService.groupFlatFields(). `badge` was dropped the same day —
// the "Live" / "Coming Soon" pill is derived from `status`.
@Schema({ _id: false })
export class ServiceContent {
  @Prop() tagline?: string;
  @Prop() tagline_ar?: string;
  @Prop() description?: string;
  @Prop() description_ar?: string;
  @Prop({ type: [String], default: [] }) capabilities: string[];
  @Prop({ type: [String], default: [] }) capabilities_ar: string[];
  @Prop({ type: [Object], default: [] }) heroStats: HeroStat[];
  // Marketing cards. Deliberately NOT named `features` — that name is
  // pricing.features[] (plan bullet strings), a different shape (rules.md #6).
  @Prop({ type: [Object], default: [] }) featureCards: FeatureCard[];
  @Prop({ type: [Object], default: [] }) howItWorks: HowItWorksStep[];
  @Prop({ type: [Object], default: [] }) faq: ServiceFaq[];
  @Prop() demoVideoUrl?: string;
  @Prop() brochureUrl?: string;
}
export const ServiceContentSchema = SchemaFactory.createForClass(ServiceContent);

@Schema({ _id: false })
export class ServiceSeo {
  @Prop() metaTitle?: string;
  @Prop() metaTitle_ar?: string;
  @Prop() metaDescription?: string;
  @Prop() metaDescription_ar?: string;
}
export const ServiceSeoSchema = SchemaFactory.createForClass(ServiceSeo);

// Card styling. Never nested under a key called `config` (rules.md #5 —
// that name means a customer's settings on userservices).
@Schema({ _id: false })
export class ServiceDisplay {
  @Prop({ default: '🤖' }) icon: string;
  @Prop({ default: '#7c3aed' }) color: string;
  @Prop({ default: 0 }) sortOrder: number;
  // Descriptive/marketing only (e.g. ['WhatsApp']) — never a customer's
  // channel credentials; those live on userservices.config.
  @Prop({ type: [String], default: [] }) platforms: string[];
}
export const ServiceDisplaySchema = SchemaFactory.createForClass(ServiceDisplay);

@Schema({ _id: false })
export class ServicePipeline {
  // Which pipeline the Python service runs (sent on subscribe, and what
  // pipeline_runs snapshots at run time).
  @Prop() pipelineType?: string;
  @Prop({ enum: PipelineCategory, default: PipelineCategory.STANDALONE })
  pipelineCategory: PipelineCategory;
  // niche_pipeline only
  @Prop({ type: [Object], default: [] })
  components: { key: string; name: string; description: string; icon: string; isRequired: boolean; sortOrder: number }[];
  @Prop({ type: [String], default: [] }) requiredApiKeys: string[];
  // Seeds a new userservices.config with sensible starting values.
  @Prop({ type: Object, default: {} }) defaultConfig: Record<string, any>;
}
export const ServicePipelineSchema = SchemaFactory.createForClass(ServicePipeline);

@Schema({ timestamps: true, collection: 'services' })
export class Service {
  @Prop({ enum: ServiceType, required: true })
  type: ServiceType;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) name_ar?: string;

  // No slug_ar, ever (rules.md #4).
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  // Drives visibility AND the public pill: active = "Live",
  // coming_soon = "Coming Soon", inactive = hidden.
  @Prop({ enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  @Prop({ default: false }) isDeleted: boolean;

  // Plain string, not an enum — the old ModuleTemplate enums had drifted
  // out of sync with the values actually stored.
  @Prop() nicheSlug?: string;

  // BUNDLE ONLY. Read once at subscribe time to fan out into N userservices
  // rows (rules.md #3) — never duplicated onto userservices.
  @Prop({ type: [Types.ObjectId], ref: 'Service', default: [] })
  include: Types.ObjectId[];

  @Prop({ type: ServiceContentSchema, default: () => ({}) }) content: ServiceContent;
  @Prop({ type: ServiceSeoSchema, default: () => ({}) }) seo: ServiceSeo;
  @Prop({ type: ServiceDisplaySchema, default: () => ({}) }) display: ServiceDisplay;
  @Prop({ type: ServicePipelineSchema, default: () => ({}) }) pipeline: ServicePipeline;

  // Single plan (agents/automations) plus, for chatbots, Basic/Pro `tiers`.
  @Prop({ type: Object, default: () => ({ monthly: 0, annual: 0, features: [], tiers: [] }) })
  pricing: ServicePricing;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

ServiceSchema.index({ type: 1, status: 1, isDeleted: 1, 'display.sortOrder': 1 });
ServiceSchema.index({ nicheSlug: 1 });

// Old flat field → grouped location, used by the one-time 2026-11-16
// migration (ServicesService.groupFlatFields()). group → { newKey: oldField }.
export const SERVICE_FIELD_GROUPS: Record<string, Record<string, string>> = {
  content: {
    tagline: 'tagline', tagline_ar: 'tagline_ar', description: 'description', description_ar: 'description_ar',
    capabilities: 'capabilities', capabilities_ar: 'capabilities_ar', heroStats: 'heroStats',
    featureCards: 'featureCards', howItWorks: 'howItWorks', faq: 'faq',
    demoVideoUrl: 'demoVideoUrl', brochureUrl: 'brochureUrl',
  },
  seo: {
    metaTitle: 'metaTitle', metaTitle_ar: 'metaTitle_ar',
    metaDescription: 'metaDescription', metaDescription_ar: 'metaDescription_ar',
  },
  display: { icon: 'icon', color: 'color', sortOrder: 'sortOrder', platforms: 'platforms' },
  pipeline: {
    pipelineType: 'pipelineType', pipelineCategory: 'pipelineCategory', components: 'components',
    requiredApiKeys: 'requiredApiKeys', defaultConfig: 'defaultConfig',
  },
  pricing: { tiers: 'pricingTiers', stripePriceId: 'stripePriceId' },
};
