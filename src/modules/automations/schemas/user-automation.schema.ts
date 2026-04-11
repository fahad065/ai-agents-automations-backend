import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserAutomationDocument = UserAutomation & Document;

export enum UserAutomationStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class UserAutomation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AutomationTemplate', required: true })
  templateId: Types.ObjectId;

  @Prop({ enum: UserAutomationStatus, default: UserAutomationStatus.ACTIVE })
  status: UserAutomationStatus;

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;

  @Prop()
  activatedAt: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const UserAutomationSchema = SchemaFactory.createForClass(UserAutomation);
UserAutomationSchema.index({ userId: 1, isDeleted: 1 });
UserAutomationSchema.index({ userId: 1, templateId: 1 }, { unique: true, sparse: true });