import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ActivityLog,
  ActivityLogDocument,
  ActivityAction,
  ActorRole,
} from './schemas/activity-log.schema';

export interface RecordActivityInput {
  userId: string; // subject/account this entry belongs to
  actorId: string; // who actually performed it
  actorRole: ActorRole;
  action: ActivityAction;
  entityType: string;
  entityId?: string;
  changes?: { before?: Record<string, any>; after?: Record<string, any> };
  description: string;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectModel(ActivityLog.name) private model: Model<ActivityLogDocument>,
  ) {}

  // The one shared entry point every module calls explicitly — never a
  // generic auto-diffing interceptor (see ai/rules.md #10). Swallows its
  // own errors: a failure writing an audit trail must never break the
  // real operation it's describing.
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.model.create({
        userId: new Types.ObjectId(input.userId),
        actorId: new Types.ObjectId(input.actorId),
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ? new Types.ObjectId(input.entityId) : undefined,
        changes: input.changes,
        description: input.description,
      });
    } catch (err: any) {
      this.logger.warn(`record() failed (${input.entityType}/${input.action}): ${err?.message}`);
    }
  }

  // A regular user's own feed — everything that happened on their
  // account, including actions an admin took on their behalf.
  async findForUser(userId: string, page = 1, limit = 20) {
    page = Math.max(1, page);
    limit = Math.min(100, Math.max(1, limit));
    const skip = (page - 1) * limit;
    const filter = { userId: new Types.ObjectId(userId) };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'name email role')
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Admin's global feed — every user, filterable.
  async findAllAdmin(query: {
    page?: number;
    limit?: number;
    userId?: string;
    entityType?: string;
    action?: ActivityAction;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.userId) filter.userId = new Types.ObjectId(query.userId);
    if (query.entityType) filter.entityType = query.entityType;
    if (query.action) filter.action = query.action;

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .populate('actorId', 'name email role')
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
