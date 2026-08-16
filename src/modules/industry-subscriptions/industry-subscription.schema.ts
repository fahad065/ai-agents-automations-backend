import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IndustrySubscriptionDocument = IndustrySubscription & Document;

export enum IndustrySubStatus {
  TRIAL     = 'trial',
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  EXPIRED   = 'expired',
  CANCELLED = 'cancelled',
}

export enum SubPlanType {
  FREE_TRIAL   = 'free_trial',
  MONTHLY      = 'monthly',
  ANNUAL       = 'annual',
}

@Schema({ _id: false })
class ApiKeyEntry {
  @Prop({ required: true }) key: string;   // e.g. 'YOUTUBE_API_KEY'
  @Prop({ required: true }) value: string; // encrypted at rest
  @Prop() label?: string;                  // human-readable label
}

@Schema({ timestamps: true, collection: 'industry_subscriptions' })
export class IndustrySubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Industry', required: true })
  industryId: Types.ObjectId;

  @Prop({ required: true })
  industrySlug: string; // denormalized for fast lookups

  // Modules included in this subscription
  // defaultModuleIds = what admin set on the industry at subscribe time (snapshot)
  @Prop({ type: [Types.ObjectId], ref: 'ModuleTemplate', default: [] })
  defaultModuleIds: Types.ObjectId[];

  // Extra modules the user added on top of the default bundle
  @Prop({ type: [Types.ObjectId], ref: 'ModuleTemplate', default: [] })
  addedModuleIds: Types.ObjectId[];

  // ── Pricing ───────────────────────────────────────────────
  @Prop({ default: 0 }) basePrice: number;   // industry bundle price
  @Prop({ default: 0 }) addOnPrice: number;  // sum of added module prices
  @Prop({ default: 0 }) totalPrice: number;  // basePrice + addOnPrice

  @Prop({ enum: SubPlanType, default: SubPlanType.FREE_TRIAL })
  planType: string;

  @Prop({ enum: IndustrySubStatus, default: IndustrySubStatus.TRIAL })
  status: string;

  // ── Setup wizard ─────────────────────────────────────────
  @Prop({ default: false })
  setupComplete: boolean;

  @Prop({ default: 0 })
  setupStep: number; // which step the user is on (0 = not started)

  // API keys stored per module
  // key = moduleId.toString(), value = array of ApiKeyEntry
  @Prop({ type: Object, default: {} })
  apiKeys: Record<string, ApiKeyEntry[]>;

  // User config per module (custom name, schedule, etc.)
  @Prop({ type: Object, default: {} })
  moduleConfigs: Record<string, Record<string, any>>;

  // ── Trial ─────────────────────────────────────────────────
  @Prop({ default: () => new Date() })
  trialStartDate: Date;

  @Prop({
    default: () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d;
    },
  })
  trialEndDate: Date;

  // ── Country (set at subscribe time) ───────────────────────
  @Prop({ default: 'UAE' })
  country: string;

  // ── Stripe (future) ───────────────────────────────────────
  @Prop() stripeSubscriptionId?: string;
  @Prop() stripeCustomerId?: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const IndustrySubscriptionSchema = SchemaFactory.createForClass(IndustrySubscription);

IndustrySubscriptionSchema.index({ userId: 1 });
IndustrySubscriptionSchema.index({ userId: 1, industrySlug: 1 }, { unique: true });
IndustrySubscriptionSchema.index({ status: 1 });
IndustrySubscriptionSchema.index({ trialEndDate: 1 });
