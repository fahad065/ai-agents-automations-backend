import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserModuleDocument = UserModule & Document;

export enum UserModuleStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  TRIAL     = 'trial',
  EXPIRED   = 'expired',
  CANCELLED = 'cancelled',
}

export enum ApiKeyMode {
  OWN_KEYS      = 'own_keys',
  PLATFORM_KEYS = 'platform_keys',
}

export enum PlanType {
  FREE_TRIAL    = 'free_trial',
  MONTHLY       = 'monthly',
  ANNUAL        = 'annual',
  FREE_FOREVER  = 'free_forever',
}

@Schema({ timestamps: true, collection: 'usermodules' })
export class UserModule {
  // ── References ────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ModuleTemplate', required: true })
  moduleId: Types.ObjectId;

  // ── Module info (denormalized for quick access) ───────────
  @Prop({ required: true })
  moduleName: string;

  @Prop({ required: true })
  moduleType: string;    // 'agent' | 'automation'

  @Prop({ required: true })
  pipelineType: string;  // 'youtube' | 'podcast' etc

  // ── Custom name & config ──────────────────────────────────
  @Prop({ required: true })
  name: string;           // user's custom name for this module

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;  // custom config overrides

  // ── Status & plan ─────────────────────────────────────────
  @Prop({ enum: UserModuleStatus, default: UserModuleStatus.TRIAL })
  status: string;

  @Prop({ enum: PlanType, default: PlanType.FREE_TRIAL })
  planType: string;

  @Prop({ enum: ApiKeyMode, default: ApiKeyMode.OWN_KEYS })
  apiKeyMode: string;

  @Prop({ default: 0 })
  billingAmount: number;

  // ── Trial ─────────────────────────────────────────────────
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

  // ── Free forever (admin grant) ────────────────────────────
  @Prop({ default: false })
  isFreeForever: boolean;

  @Prop({ type: Types.ObjectId })
  freeForeverGrantedBy?: Types.ObjectId;

  @Prop()
  extendedUntil?: Date;

  // ── YouTube specific ──────────────────────────────────────
  @Prop()
  youtubeChannelId?: string;

  @Prop()
  niche?: string;

  // ── Schedule ──────────────────────────────────────────────
  @Prop({ default: 'manual' })
  scheduleFrequency: string;  // 'manual' | 'daily' | 'weekly'

  @Prop({ default: '08:00' })
  scheduleTime: string;

  // ── Stats ─────────────────────────────────────────────────
  @Prop({ default: 0 }) totalRuns: number;
  @Prop({ default: 0 }) totalCost: number;
  @Prop() lastRunAt?: Date;
  @Prop() nextRunAt?: Date;

  // ── Paddle ────────────────────────────────────────────────
  @Prop() paddleSubscriptionId?: string;
  @Prop() paddleCustomerId?: string;

  // ── Soft delete ───────────────────────────────────────────
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const UserModuleSchema = SchemaFactory.createForClass(UserModule);

UserModuleSchema.index({ userId: 1 });
UserModuleSchema.index({ userId: 1, isDeleted: 1 });
UserModuleSchema.index({ moduleId: 1 });
UserModuleSchema.index({ status: 1 });
UserModuleSchema.index({ trialEndDate: 1 });
UserModuleSchema.index({ pipelineType: 1 });