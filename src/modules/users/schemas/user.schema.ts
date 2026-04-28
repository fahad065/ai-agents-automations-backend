import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  APPLE = 'apple',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum PlanType {
  TRIAL = 'trial',
  PAID = 'paid',
  FREE_FOREVER = 'free_forever',
  EXPIRED = 'expired',
}

@Schema({ _id: false })
class OnboardingData {
  @Prop() role?: string;
  @Prop() primaryGoal?: string;
  @Prop() contentNiche?: string;
  @Prop() experienceLevel?: string;
  @Prop() teamSize?: string;
  @Prop() monthlyBudget?: string;
  @Prop() heardAboutUs?: string;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  country?: string;

  @Prop()
  timezone?: string;
 
  @Prop()
  company?: string;
 
  // Notification preferences
  @Prop({ default: true })
  notifyOnComplete: boolean;
 
  @Prop({ default: true })
  notifyOnFail: boolean;
 
  @Prop({ default: true })
  notifyTrialExpiry: boolean;
 
  @Prop({ default: true })
  notifyBilling: boolean;
 
  @Prop({ default: false })
  emailUpdates: boolean;

  @Prop({ select: false })
  password?: string;

  @Prop({ enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop()
  googleId?: string;

  @Prop()
  facebookId?: string;

  @Prop()
  appleId?: string;

  @Prop()
  avatar?: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  refreshToken?: string;

  @Prop({ default: 0 })
  totalVideosGenerated: number;

  @Prop({ default: 0 })
  totalCreditsUsed: number;

  // ── Onboarding ──────────────────────────────────────────────
  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ type: Object, default: {} })
  onboarding: OnboardingData;

  // ── Trial / Plan ────────────────────────────────────────────
  @Prop({ enum: PlanType, default: PlanType.TRIAL })
  planType: PlanType;

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

  @Prop({ default: false })
  isFreeForever: boolean;

  @Prop({ type: Types.ObjectId })
  freeForeverGrantedBy?: Types.ObjectId;

  @Prop()
  trialExtendedUntil?: Date;

  @Prop({ type: Types.ObjectId })
  trialExtendedBy?: Types.ObjectId;

  // ── Billing summary (denormalized for quick access) ─────────
  @Prop({ default: 0 })
  totalBilled: number;

  @Prop({ default: 0 })
  totalAgents: number;

  @Prop({ default: 0 })
  totalAutomations: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

// UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ planType: 1 });
UserSchema.index({ trialEndDate: 1 });
UserSchema.index({ isDeleted: 1 });