import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContentIdeaDocument = ContentIdea & Document;

export enum ContentIdeaStatus {
  DRAFT = 'draft',
  SCRIPT_READY = 'script_ready',
  VIDEO_QUEUED = 'video_queued',
  VIDEO_READY = 'video_ready',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class ContentIdea {
  @Prop({ type: Types.ObjectId, ref: 'UserAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Trend' })
  trendId?: Types.ObjectId;

  @Prop({ required: true })
  topic: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  script?: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  seoKeywords: string[];

  @Prop()
  thumbnailPrompt?: string;

  @Prop({ enum: ContentIdeaStatus, default: ContentIdeaStatus.DRAFT })
  status: ContentIdeaStatus;

  // Local output folder path
  @Prop()
  outputFolderPath?: string;

  // Final video file paths
  @Prop()
  videoPath?: string;

  @Prop({ type: [String], default: [] })
  shortsPaths: string[];

  @Prop()
  thumbnailPath?: string;

  // YouTube result
  @Prop()
  youtubeVideoId?: string;

  @Prop()
  youtubeUrl?: string;

  @Prop()
  scheduledUploadTime?: Date;

  @Prop()
  uploadedAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ContentIdeaSchema = SchemaFactory.createForClass(ContentIdea);
ContentIdeaSchema.index({ agentId: 1, status: 1 });
ContentIdeaSchema.index({ agentId: 1, createdAt: -1 });