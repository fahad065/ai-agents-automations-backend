import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrendDocument = Trend & Document;

@Schema({ timestamps: true })
export class Trend {
  @Prop({ type: Types.ObjectId, ref: 'UserAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  niche: string;

  @Prop({ type: [String], default: [] })
  discoveredTopics: string[];

  @Prop({ type: [Object], default: [] })
  rawYoutubeData: Record<string, any>[];

  @Prop({ required: true })
  selectedTopic: string;

  @Prop()
  topicReason: string;

  @Prop({ default: 'pending' })
  status: string; // pending | used | skipped

  @Prop()
  trendDate: Date;
}

export const TrendSchema = SchemaFactory.createForClass(Trend);
TrendSchema.index({ agentId: 1, trendDate: -1 });
TrendSchema.index({ agentId: 1, status: 1 });