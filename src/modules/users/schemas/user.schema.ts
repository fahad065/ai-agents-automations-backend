import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

// facebook/apple were never real — AuthService.facebookLogin() had no
// controller route wired to it (dead code, unreachable) and there's no
// Apple integration at all. Google is the only live social-auth path.
// See ai/architecture.md's "users" section.
export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
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

// Status enum instead of a boolean — matches the convention applied
// across every collection in this redesign (users/services/cms/apikeys/
// userservices/billing all get `status`, not an `isActive` flag). Old
// `isActive: boolean` docs are migrated by UsersService.onModuleInit().
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
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

// Replaces 5 separate top-level booleans (notifyOnComplete/notifyOnFail/
// notifyTrialExpiry/notifyBilling/emailUpdates) with one nested object,
// per ai/architecture.md's finalized `users` shape. Old flat-boolean docs
// are migrated by UsersService.onModuleInit().
@Schema({ _id: false })
class NotifyPreferences {
  @Prop({ default: true }) onComplete: boolean;
  @Prop({ default: true }) onFail: boolean;
  @Prop({ default: true }) trialExpiry: boolean;
  @Prop({ default: true }) billing: boolean;
  @Prop({ default: false }) emailUpdates: boolean;
}

// minimize: false so `onboarding: {}` is actually stored on signup, as the
// architecture.md shape lists it. Mongoose's default (minimize: true) strips
// empty objects on save — which is also why notifyPreferences went missing.
@Schema({ timestamps: true, minimize: false })
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

  // Real values, not `{}` — Mongoose's default `minimize` strips empty
  // objects on save, so a `{}` default meant brand-new signups were stored
  // with no notifyPreferences field at all.
  @Prop({
    type: Object,
    default: () => ({ onComplete: true, onFail: true, trialExpiry: true, billing: true, emailUpdates: false }),
  })
  notifyPreferences: NotifyPreferences;

  @Prop({ select: false })
  password?: string;

  @Prop({ enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop()
  googleId?: string;

  @Prop()
  avatar?: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;
  
  @Prop()
  emailVerificationToken?: string;
  
  @Prop()
  emailVerificationExpires?: Date;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  // Welcome-sequence send guards — without these, the day1/3/7 emails
  // in trial-expiry.cron.ts's @Cron('0 10 * * *') welcome job would fire
  // once per user PER SERVER REPLICA (each instance independently scans
  // the same "created N days ago" window with no shared state), sending
  // duplicate onboarding emails once a second backend instance is added.
  @Prop({ default: false })
  welcomeDay1Sent: boolean;

  @Prop({ default: false })
  welcomeDay3Sent: boolean;

  @Prop({ default: false })
  welcomeDay7Sent: boolean;

  @Prop()
  refreshToken?: string;

  // ── Onboarding ──────────────────────────────────────────────
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
  isFreeForever: boolean;

  // ── Billing summary (denormalized for quick access) ─────────
  @Prop({ default: 0 })
  totalBilled: number;
  // totalAgents/totalAutomations deliberately dropped — premature
  // denormalization that nothing ever actually read as a stored field.
  // UsersService.findAll() now computes these fresh per request (agent/
  // automation count from UserModule, chatbot count from Chatbot) instead.

  // ── Account deletion ─────────────────────────────────────────
  // Two paths: instant (deleted synchronously, no fields below ever get
  // set) or scheduled — set the moment a user requests the 8-calendar-day
  // path; cleared if they cancel. `pendingDeletionAt` is the actual
  // deletion date (day 8), not the request date. AccountDeletionCron
  // sweeps daily: sends one reminder on day 7 (pendingDeletionAt - 1 day,
  // claimed via deletionReminderSent so it only ever fires once), then
  // performs the real deletion once pendingDeletionAt <= now. The account
  // stays fully usable the whole time so the user can actually get to
  // Settings to export their backup.
  @Prop()
  deletionRequestedAt?: Date;

  @Prop()
  pendingDeletionAt?: Date;

  @Prop({ default: false })
  deletionReminderSent: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ planType: 1 });
UserSchema.index({ trialEndDate: 1 });
UserSchema.index({ isDeleted: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ pendingDeletionAt: 1 }, { sparse: true });