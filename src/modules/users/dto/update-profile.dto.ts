import {
    IsOptional, IsString,
    MaxLength, MinLength,
  } from 'class-validator';
  import { Transform } from 'class-transformer';
  
  export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    @Transform(({ value }) => value?.trim())
    name?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(200)
    niche?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(20)
    timezone?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(20)
    scheduleTime?: string;
  
    @IsOptional()
    notifyOnComplete?: boolean;
  
    @IsOptional()
    notifyOnFail?: boolean;
  }