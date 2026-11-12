import { IsOptional, IsString, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class OnboardingDto {
  @IsOptional() @IsString() contentNiche?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() primaryGoal?: string;
  @IsOptional() @IsString() experienceLevel?: string;
  @IsOptional() @IsString() teamSize?: string;
  @IsOptional() @IsString() monthlyBudget?: string;
  @IsOptional() @IsString() heardAboutUs?: string;
}

class NotifyPreferencesDto {
  @IsOptional() @IsBoolean() onComplete?: boolean;
  @IsOptional() @IsBoolean() onFail?: boolean;
  @IsOptional() @IsBoolean() trialExpiry?: boolean;
  @IsOptional() @IsBoolean() billing?: boolean;
  @IsOptional() @IsBoolean() emailUpdates?: boolean;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() company?: string;

  @IsOptional() @ValidateNested() @Type(() => OnboardingDto)
  onboarding?: OnboardingDto;

  // Replaces the old 5 flat booleans (notifyOnComplete/notifyOnFail/
  // notifyTrialExpiry/notifyBilling/emailUpdates) — see user.schema.ts's
  // NotifyPreferences. A partial object merges correctly because
  // UsersService.updateProfile() does a dotted $set per sub-field, not a
  // whole-object overwrite (see that method).
  @IsOptional() @ValidateNested() @Type(() => NotifyPreferencesDto)
  notifyPreferences?: NotifyPreferencesDto;
}