import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeedbackDocument = Feedback & Document;

@Schema({ timestamps: true })
export class Feedback {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  moduleId?: Types.ObjectId;

  @Prop()
  moduleType?: string;

  @Prop()
  moduleName?: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop()
  userName?: string;

  @Prop()
  userAvatar?: string;

  @Prop()
  userRole?: string;

  // Admin approves before showing on website
  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

FeedbackSchema.index({ userId: 1 });
FeedbackSchema.index({ moduleId: 1 });
FeedbackSchema.index({ isApproved: 1 });
FeedbackSchema.index({ rating: -1 });
FeedbackSchema.index({ isDeleted: 1 });