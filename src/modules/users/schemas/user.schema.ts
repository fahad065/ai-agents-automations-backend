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
// per ai/architecture.md's finalized `users` shape.
@Schema({ _id: false })
class NotifyPreferences {
  @Prop({ default: true }) onComplete: boolean;
  @Prop({ default: true }) onFail: boolean;
  @Prop({ default: true }) trialExpiry: boolean;
  @Prop({ default: true }) billing: boolean;
  @Prop({ default: false }) emailUpdates: boolean;
}

// Grouped sub-documents (2026-11-16, user-approved): personal details,
// auth state, plan/trial, welcome-email guards and the deletion flow each
// live in their own object. name/email/password/role/status stay top level.
@Schema({ _id: false })
export class UserProfile {
  @Prop() phoneNumber?: string;
  @Prop() country?: string;
  @Prop() avatar?: string;
  @Prop() timezone?: string;
  @Prop() company?: string;
}
export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

@Schema({ _id: false })
export class UserAuth {
  @Prop({ enum: AuthProvider, default: AuthProvider.LOCAL }) provider: AuthProvider;
  @Prop() googleId?: string;
  @Prop({ default: false }) isEmailVerified: boolean;
  @Prop() emailVerificationToken?: string;
  @Prop() emailVerificationExpires?: Date;
  @Prop() passwordResetToken?: string;
  @Prop() passwordResetExpires?: Date;
  @Prop() refreshToken?: string;
}
export const UserAuthSchema = SchemaFactory.createForClass(UserAuth);

@Schema({ _id: false })
export class UserPlan {
  @Prop({ enum: PlanType, default: PlanType.TRIAL }) planType: PlanType;
  @Prop({ default: () => new Date() }) trialStartDate: Date;
  @Prop({ default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }) trialEndDate: Date;
  @Prop({ default: false }) isFreeForever: boolean;
  // Denormalized billing total — the dashboard reads it often.
  @Prop({ default: 0 }) totalBilled: number;
}
export const UserPlanSchema = SchemaFactory.createForClass(UserPlan);

// Welcome-sequence send guards. Claimed atomically by trial-expiry.cron.ts
// so each email fires once even with several server replicas.
@Schema({ _id: false })
export class UserWelcomeEmails {
  @Prop({ default: false }) day1Sent: boolean;
  @Prop({ default: false }) day3Sent: boolean;
  @Prop({ default: false }) day7Sent: boolean;
}
export const UserWelcomeEmailsSchema = SchemaFactory.createForClass(UserWelcomeEmails);

// Scheduled (8-calendar-day) account deletion. Instant deletion never sets
// these. pendingAt is the actual deletion date; reminderSent guards the
// single day-7 reminder (claimed atomically by AccountDeletionCron).
@Schema({ _id: false })
export class UserDeletion {
  @Prop() requestedAt?: Date;
  @Prop() pendingAt?: Date;
  @Prop({ default: false }) reminderSent: boolean;
}
export const UserDeletionSchema = SchemaFactory.createForClass(UserDeletion);

// minimize: false so `onboarding: {}` is actually stored on signup.
// Mongoose's default (minimize: true) strips empty objects on save.
@Schema({ timestamps: true, minimize: false })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: UserProfileSchema, default: () => ({}) })
  profile: UserProfile;

  @Prop({ type: UserAuthSchema, default: () => ({}) })
  auth: UserAuth;

  @Prop({ type: UserPlanSchema, default: () => ({}) })
  plan: UserPlan;

  @Prop({ type: UserWelcomeEmailsSchema, default: () => ({}) })
  welcomeEmails: UserWelcomeEmails;

  @Prop({ type: UserDeletionSchema, default: () => ({}) })
  deletion: UserDeletion;

  @Prop({ type: Object, default: {} })
  onboarding: OnboardingData;

  // Real values, not `{}` — see minimize note above.
  @Prop({
    type: Object,
    default: () => ({ onComplete: true, onFail: true, trialExpiry: true, billing: true, emailUpdates: false }),
  })
  notifyPreferences: NotifyPreferences;
}

export const UserSchema = SchemaFactory.createForClass(User);

// UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'auth.googleId': 1 }, { sparse: true });
UserSchema.index({ 'plan.planType': 1 });
UserSchema.index({ 'plan.trialEndDate': 1 });
UserSchema.index({ isDeleted: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ 'deletion.pendingAt': 1 }, { sparse: true });
// Strips secrets before a user leaves the API: the password hash and every
// auth token (refresh, email-verification, password-reset). Everything else
// in `auth` (provider, googleId, isEmailVerified) is safe to return.
export function sanitizeUser<T extends Record<string, any>>(obj: T): T {
  const { password, ...rest } = obj as any;
  if (rest.auth) {
    const { refreshToken, emailVerificationToken, emailVerificationExpires,
      passwordResetToken, passwordResetExpires, ...safeAuth } = rest.auth;
    rest.auth = safeAuth;
  }
  return rest;
}

// Mongoose projection that leaves out the same secrets as sanitizeUser().
export const USER_PUBLIC_PROJECTION =
  '-password -auth.refreshToken -auth.emailVerificationToken -auth.emailVerificationExpires -auth.passwordResetToken -auth.passwordResetExpires';
