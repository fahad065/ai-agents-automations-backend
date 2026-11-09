import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

export enum ActivityAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum ActorRole {
  USER = 'user',
  ADMIN = 'admin',
}

// Append-only audit trail — no isDeleted here, deliberately, same reasoning
// already applied to knowledge_bases/conversations: an audit log that can
// be hidden by the account it's auditing isn't an audit log.
@Schema({ timestamps: true })
export class ActivityLog {
  // Whose account this entry belongs to / is visible under — NOT
  // necessarily who performed the action. When an admin acts on a
  // client's behalf (e.g. configuring their chatbot), this is the
  // client's id, so the client sees "an admin did X on your account" in
  // their own activity feed — actorId/actorRole below says who actually
  // did it.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  // Role at the time of the action — stored rather than re-derived, so a
  // later role change doesn't rewrite history.
  @Prop({ enum: ActorRole, required: true })
  actorRole: ActorRole;

  @Prop({ enum: ActivityAction, required: true })
  action: ActivityAction;

  // Free-text, not an enum — new modules add new entityType values
  // without a schema migration (e.g. 'chatbot', 'knowledge_base',
  // 'apikey', 'usermodule', 'user').
  @Prop({ required: true })
  entityType: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  // An EXPLICIT, hand-picked subset of fields per call site — never the
  // raw document. The caller decides what's safe to log; never
  // encryptedKey/password/embedding/raw API keys. See
  // ai/rules.md #10.
  @Prop({ type: Object })
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  @Prop({ required: true })
  description: string;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Own feed (user) + admin's "filter by this user" — the most common query.
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
// Admin's unfiltered global feed, newest first — the default view.
ActivityLogSchema.index({ createdAt: -1 });
// Admin filtering by module/entity type across all users.
ActivityLogSchema.index({ entityType: 1, createdAt: -1 });
