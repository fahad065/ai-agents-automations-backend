import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserAgentDocument = UserAgent & Document;

export enum AgentStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
}

@Schema({ timestamps: true })
export class UserAgent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AgentTemplate', required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;

  @Prop({ enum: AgentStatus, default: AgentStatus.ACTIVE })
  status: AgentStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ default: 0 })
  videosGenerated: number;

  @Prop({ default: 0 })
  creditsUsed: number;

  @Prop()
  lastRunAt?: Date;

  @Prop()
  nextRunAt?: Date;

  @Prop()
  youtubeChannelId?: string;

  @Prop()
  niche?: string;

  @Prop({ default: 'daily' })
  scheduleFrequency: string;

  @Prop({ default: '08:00' })
  scheduleTime: string;
}

export const UserAgentSchema = SchemaFactory.createForClass(UserAgent);
UserAgentSchema.index({ userId: 1 });
UserAgentSchema.index({ userId: 1, isDeleted: 1 });