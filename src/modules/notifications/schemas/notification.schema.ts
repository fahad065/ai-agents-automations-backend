import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  // Pipeline
  PIPELINE_STARTED = 'pipeline_started',
  PIPELINE_COMPLETE = 'pipeline_complete',
  PIPELINE_FAILED = 'pipeline_failed',
  // Agents
  AGENT_CREATED = 'agent_created',
  AGENT_DELETED = 'agent_deleted',
  AGENT_PAUSED = 'agent_paused',
  // API Keys
  API_KEY_ADDED = 'api_key_added',
  API_KEY_DELETED = 'api_key_deleted',
  // Users
  USER_REGISTERED = 'user_registered',
  USER_PLAN_UPGRADED = 'user_plan_upgraded',
  // System
  SYSTEM_ALERT = 'system_alert',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: NotificationType, required: true })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  priority: NotificationPriority;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop()
  actionUrl?: string;

  @Prop()
  icon?: string;

  // Add to notification.schema.ts inside the class:
  @Prop({ default: false })
  isDeleted: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, isDeleted: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });