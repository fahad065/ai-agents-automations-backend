import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PipelineRunDocument = PipelineRun & Document;

export enum PipelineRunStatus {
  PENDING    = 'pending',
  RUNNING    = 'running',
  COMPLETE   = 'complete',
  FAILED     = 'failed',
  CANCELLED  = 'cancelled',
}

export enum PipelineModuleType {
  YOUTUBE    = 'youtube',
  PODCAST    = 'podcast',
  REALESTATE = 'realestate',
  MARKETING  = 'marketing',
  SOCIAL     = 'social',
}

@Schema({ _id: false })
class ApiCostBreakdown {
  @Prop({ default: 0 }) openai: number;
  @Prop({ default: 0 }) seedance: number;
  @Prop({ default: 0 }) atlas: number;
  @Prop({ default: 0 }) other: number;
}

@Schema({ _id: false })
class PipelineStep {
  @Prop({ required: true }) step: number;
  @Prop({ required: true }) label: string;
  @Prop({ default: 'pending' }) status: string;
  @Prop() startedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() error?: string;
}

@Schema({ timestamps: true })
export class PipelineRun {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserAgent' })
  agentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  moduleId?: Types.ObjectId;

  @Prop({
    enum: PipelineModuleType,
    default: PipelineModuleType.YOUTUBE,
  })
  moduleType: PipelineModuleType;

  // Python run ID (UUID) — used for SSE log streaming
  @Prop({ required: true, unique: true })
  runId: string;

  @Prop({
    enum: PipelineRunStatus,
    default: PipelineRunStatus.PENDING,
  })
  status: PipelineRunStatus;

  // Current step number (1-7 for YouTube)
  @Prop({ default: 0 })
  currentStep: number;

  @Prop({ default: 7 })
  totalSteps: number;

  // Output folder path — used for resume without rebilling
  @Prop()
  folderPath?: string;

  // How many clips generated — resume skips already-generated clips
  @Prop({ default: 0 })
  clipsGenerated: number;

  @Prop({ type: [String], default: [] })
  clipPaths: string[];

  // Content details
  @Prop()
  niche?: string;

  @Prop()
  title?: string;

  @Prop()
  topic?: string;

  // Results
  @Prop()
  youtubeUrl?: string;

  @Prop({ type: [String], default: [] })
  shortsUrls: string[];

  @Prop()
  thumbnailPath?: string;

  @Prop()
  videoPath?: string;

  // Cost tracking
  @Prop({ default: 0 })
  totalCost: number;

  @Prop({ type: Object, default: {} })
  costBreakdown: ApiCostBreakdown;

  // API keys used in this run
  @Prop({ type: [String], default: [] })
  apiKeysUsed: string[];

  // Pipeline steps tracking
  @Prop({ type: [Object], default: [] })
  steps: PipelineStep[];

  // Logs stored in DB — max 500 entries
  @Prop({ type: [String], default: [] })
  logs: string[];

  @Prop()
  errorMessage?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const PipelineRunSchema = SchemaFactory.createForClass(PipelineRun);

PipelineRunSchema.index({ userId: 1, status: 1 });
PipelineRunSchema.index({ agentId: 1, status: 1 });
// PipelineRunSchema.index({ runId: 1 }, { unique: true });
PipelineRunSchema.index({ moduleType: 1 });
PipelineRunSchema.index({ createdAt: -1 });
PipelineRunSchema.index({ isDeleted: 1 });