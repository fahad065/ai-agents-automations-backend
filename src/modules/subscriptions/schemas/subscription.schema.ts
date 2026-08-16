import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  ACTIVE    = 'active',
  EXPIRED   = 'expired',
  CANCELLED = 'cancelled',
  PAUSED    = 'paused',
  TRIAL     = 'trial',
}

export enum SubscriptionPlanType {
  FREE_TRIAL    = 'free_trial',
  MONTHLY       = 'monthly',
  ANNUAL        = 'annual',
  FREE_FOREVER  = 'free_forever',
}

export enum ApiKeyMode {
  OWN_KEYS      = 'own_keys',      // user uses own API keys — cheaper
  PLATFORM_KEYS = 'platform_keys', // we provide keys — more expensive
}

export enum ModuleType {
  AGENT      = 'agent',
  AUTOMATION = 'automation',
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  moduleId: Types.ObjectId;

  @Prop({ enum: ModuleType, required: true })
  moduleType: ModuleType;

  @Prop({ required: true })
  moduleName: string;

  @Prop({ enum: SubscriptionPlanType, default: SubscriptionPlanType.FREE_TRIAL })
  planType: SubscriptionPlanType;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  status: SubscriptionStatus;

  @Prop({ default: 0 })
  billingAmount: number;

  @Prop({ enum: ApiKeyMode, default: ApiKeyMode.OWN_KEYS })
  apiKeyMode: ApiKeyMode;

  // Trial dates
  @Prop({ default: () => new Date() })
  trialStartDate: Date;

  @Prop({
    default: () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d;
    }
  })
  trialEndDate: Date;

  @Prop({ default: false })
  trialReminderSent: boolean;

  // Billing
  @Prop()
  nextBillingDate?: Date;

  @Prop()
  lastBilledAt?: Date;

  // Paddle integration
  @Prop()
  paddleSubscriptionId?: string;

  @Prop()
  paddleCustomerId?: string;

  // Admin overrides
  @Prop({ default: false })
  isFreeForever: boolean;

  @Prop({ type: Types.ObjectId })
  freeForeverGrantedBy?: Types.ObjectId;

  @Prop()
  extendedUntil?: Date;

  @Prop({ type: Types.ObjectId })
  extendedBy?: Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ userId: 1, moduleId: 1 });
SubscriptionSchema.index({ trialEndDate: 1 });
SubscriptionSchema.index({ isDeleted: 1 });