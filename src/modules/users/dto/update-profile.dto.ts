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

export class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() company?: string;

  @IsOptional() @ValidateNested() @Type(() => OnboardingDto)
  onboarding?: OnboardingDto;

  @IsOptional() @IsBoolean() notifyOnComplete?: boolean;
  @IsOptional() @IsBoolean() notifyOnFail?: boolean;
  @IsOptional() @IsBoolean() notifyTrialExpiry?: boolean;
  @IsOptional() @IsBoolean() notifyBilling?: boolean;
  @IsOptional() @IsBoolean() emailUpdates?: boolean;
}