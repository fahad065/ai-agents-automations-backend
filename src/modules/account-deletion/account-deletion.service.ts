import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserModule, UserModuleDocument } from '../modules/schemas/user-module.schema';
import { Chatbot, ChatbotDocument } from '../chatbots/schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseDocument } from '../chatbots/schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from '../chatbots/schemas/conversation.schema';
import { ApiKey, ApiKeyDocument } from '../api-keys/schemas/api-key.schema';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';
import { Billing, BillingDocument } from '../billing/schemas/billing.schema';
import { ActivityLog, ActivityLogDocument, ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';
import { EmailService } from '../email/email.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

const WORKING_DAYS_NOTICE = 7;

// Monday-Friday only, per the user's explicit "7 working days" requirement
// — skips weekends when counting the deletion deadline.
function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) added++;
  }
  return result;
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(UserModule.name) private userModuleModel: Model<UserModuleDocument>,
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(Billing.name) private billingModel: Model<BillingDocument>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
    private emailService: EmailService,
    private activityLogsService: ActivityLogsService,
  ) {}

  // ─── Request / cancel ──────────────────────────────────────

  async requestDeletion(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.isDeleted) throw new NotFoundException('Account not found');

    // Idempotent — re-requesting doesn't push the deadline further out.
    if (user.pendingDeletionAt) {
      return { message: 'Deletion already scheduled', scheduledFor: user.pendingDeletionAt };
    }

    const scheduledFor = addWorkingDays(new Date(), WORKING_DAYS_NOTICE);
    user.deletionRequestedAt = new Date();
    user.pendingDeletionAt = scheduledFor;
    await user.save();

    await this.emailService.sendAccountDeletionRequestedEmail(
      { name: user.name, email: user.email },
      { scheduledFor, workingDaysLeft: WORKING_DAYS_NOTICE },
    );

    await this.activityLogsService.record({
      userId, actorId: userId, actorRole: ActorRole.USER,
      action: ActivityAction.UPDATE, entityType: 'user', entityId: userId,
      changes: { after: { pendingDeletionAt: scheduledFor } },
      description: `Account deletion requested — scheduled for ${scheduledFor.toDateString()}`,
    });

    return { message: 'Deletion requested', scheduledFor };
  }

  async cancelDeletion(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Account not found');
    if (!user.pendingDeletionAt) throw new BadRequestException('No deletion request is pending');

    user.pendingDeletionAt = undefined;
    user.deletionRequestedAt = undefined;
    await user.save();

    await this.activityLogsService.record({
      userId, actorId: userId, actorRole: ActorRole.USER,
      action: ActivityAction.UPDATE, entityType: 'user', entityId: userId,
      description: 'Account deletion request cancelled',
    });

    return { message: 'Deletion cancelled' };
  }

  async getStatus(userId: string) {
    const user = await this.userModel.findById(userId).select('pendingDeletionAt deletionRequestedAt').lean();
    if (!user) throw new NotFoundException('Account not found');
    return {
      pendingDeletionAt: (user as any).pendingDeletionAt || null,
      deletionRequestedAt: (user as any).deletionRequestedAt || null,
    };
  }

  // ─── Export (the "download your backup" feature) ───────────
  // Everything the user owns — profile, chatbots + knowledge base +
  // conversation summaries, API key metadata (never raw/decrypted keys),
  // subscriptions and full billing history, plus their own activity log.
  // Conversation transcripts are summarized (counts, not full message
  // bodies) to keep this bounded — flagged here rather than silently
  // dropped, in case a future ask wants the full transcript too.
  async exportUserData(userId: string): Promise<Buffer> {
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('Account not found');

    const [chatbots, apiKeys, userModules, billing, activityLogs] = await Promise.all([
      this.chatbotModel.find({ userId: uid }).lean(),
      this.apiKeyModel.find({ userId: uid }, { encryptedKey: 0 }).lean(),
      this.userModuleModel.find({ userId: uid }).lean(),
      this.billingModel.find({ userId: uid }).sort({ billingDate: -1 }).lean(),
      this.activityLogModel.find({ userId: uid }).sort({ createdAt: -1 }).limit(1000).lean(),
    ]);

    const chatbotIds = chatbots.map((c: any) => c._id);
    const [knowledgeBase, conversations] = await Promise.all([
      this.knowledgeBaseModel.find({ chatbotId: { $in: chatbotIds } }, { embedding: 0 }).lean(),
      this.conversationModel.find({ chatbotId: { $in: chatbotIds } }).lean(),
    ]);
    const chatbotNameById = new Map(chatbots.map((c: any) => [c._id.toString(), c.name]));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'LogicMate';
    wb.created = new Date();

    const profile = wb.addWorksheet('Profile');
    profile.addRow(['Field', 'Value']);
    profile.addRows([
      ['Name', user.name], ['Email', user.email], ['Phone', user.phoneNumber || ''],
      ['Country', user.country || ''], ['Company', (user as any).company || ''],
      ['Plan type', user.planType], ['Account created', (user as any).createdAt],
    ]);

    const keys = wb.addWorksheet('API Keys');
    keys.addRow(['Provider', 'Label', 'Active', 'Created']);
    apiKeys.forEach((k: any) => keys.addRow([k.provider, k.label, k.isActive, k.createdAt]));

    const subs = wb.addWorksheet('Subscriptions');
    subs.addRow(['Module', 'Type', 'Status', 'Trial End', 'Created']);
    userModules.forEach((m: any) => subs.addRow([m.moduleName, m.moduleType, m.status, m.trialEndDate, m.createdAt]));

    const bots = wb.addWorksheet('Chatbots');
    bots.addRow(['Name', 'Template', 'Status', 'Billing Tier', 'Billing Status', 'Created']);
    chatbots.forEach((c: any) => bots.addRow([c.name, c.template, c.status, c.billing?.tier, c.billing?.status, c.createdAt]));

    const kb = wb.addWorksheet('Knowledge Base');
    kb.addRow(['Chatbot', 'Type', 'Question', 'Answer', 'Content', 'Created']);
    knowledgeBase.forEach((e: any) => kb.addRow([
      chatbotNameById.get(e.chatbotId.toString()) || '', e.type, e.question || '', e.answer || '', e.content || '', e.createdAt,
    ]));

    const convos = wb.addWorksheet('Conversations');
    convos.addRow(['Chatbot', 'Channel', 'Status', 'Message Count', 'Started']);
    conversations.forEach((c: any) => convos.addRow([
      chatbotNameById.get(c.chatbotId.toString()) || '', c.channel, c.status, (c.messages || []).length, c.createdAt,
    ]));

    const bill = wb.addWorksheet('Billing');
    bill.addRow(['Module', 'Type', 'Amount', 'Currency', 'Status', 'Description', 'Date']);
    billing.forEach((b: any) => bill.addRow([b.moduleName, b.type, b.amount, b.currency, b.status, b.description, b.billingDate]));

    const logs = wb.addWorksheet('Activity Log');
    logs.addRow(['Action', 'Module', 'Description', 'Date']);
    activityLogs.forEach((l: any) => logs.addRow([l.action, l.entityType, l.description, l.createdAt]));

    for (const sheet of wb.worksheets) {
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((col) => { col.width = 24; });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Scheduled execution (called by the cron) ───────────────
  // Anonymizes the User doc in place (stable _id, so Billing/ActivityLog
  // references still resolve and correctly show "a deleted account" —
  // see ai/architecture.md's account-deletion section for why this is
  // simpler and more consistent than scrubbing N separate collections).
  // Hard-deletes everything that's the user's OWN operational content —
  // chatbots, knowledge base, conversations, API keys, subscriptions,
  // notifications. Billing and ActivityLogs are deliberately left alone.
  async performScheduledDeletions(): Promise<{ processed: number }> {
    const now = new Date();
    const candidates = await this.userModel
      .find({ pendingDeletionAt: { $lte: now }, isDeleted: { $ne: true } })
      .select('_id')
      .lean();

    let processed = 0;
    for (const { _id } of candidates) {
      // Atomic claim — see the multi-replica note on chatbot-billing.cron.ts;
      // only the replica whose update actually matches proceeds.
      const claimed = await this.userModel.findOneAndUpdate(
        { _id, pendingDeletionAt: { $lte: now }, isDeleted: { $ne: true } },
        { $set: { isDeleted: true } },
      );
      if (!claimed) continue;

      try {
        await this.deleteUserData(claimed);
        processed++;
      } catch (err: any) {
        this.logger.error(`performScheduledDeletions() failed for user=${_id}: ${err?.message}`);
      }
    }
    return { processed };
  }

  private async deleteUserData(user: UserDocument) {
    const uid = user._id as Types.ObjectId;
    const originalEmail = user.email;
    const originalName = user.name;

    const chatbots = await this.chatbotModel.find({ userId: uid }).select('_id').lean();
    const chatbotIds = chatbots.map((c: any) => c._id);

    await Promise.all([
      this.chatbotModel.deleteMany({ userId: uid }),
      this.knowledgeBaseModel.deleteMany({ chatbotId: { $in: chatbotIds } }),
      this.conversationModel.deleteMany({ chatbotId: { $in: chatbotIds } }),
      this.apiKeyModel.deleteMany({ userId: uid }),
      this.userModuleModel.deleteMany({ userId: uid }),
      this.notificationModel.deleteMany({ userId: uid }),
    ]);

    // Anonymize, don't delete — stable _id keeps Billing/ActivityLog
    // references valid, now pointing at a scrubbed identity.
    user.name = 'Deleted User';
    user.email = `deleted-${uid.toString()}@deleted.logicmate.io`;
    user.password = undefined;
    user.refreshToken = undefined;
    user.phoneNumber = undefined;
    user.country = undefined;
    (user as any).company = undefined;
    user.googleId = undefined;
    user.facebookId = undefined;
    user.appleId = undefined;
    user.avatar = undefined;
    user.isActive = false;
    user.pendingDeletionAt = undefined;
    user.deletionRequestedAt = undefined;
    await user.save();

    await this.activityLogsService.record({
      userId: uid.toString(), actorId: uid.toString(), actorRole: ActorRole.USER,
      action: ActivityAction.DELETE, entityType: 'user', entityId: uid.toString(),
      description: 'Account and all associated data permanently deleted (scheduled deletion)',
    });

    await this.emailService.sendAccountDeletionCompletedEmail({ name: originalName, email: originalEmail }).catch(() => {});
  }
}
