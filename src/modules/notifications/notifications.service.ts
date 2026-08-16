import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
  NotificationPriority,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { EmailService } from '../email/email.service';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
  actionUrl?: string;
  icon?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  // ─── Core create ─────────────────────────────────────────────

  async create(dto: CreateNotificationDto): Promise<Notification> {
    return this.notificationModel.create({
      userId: new Types.ObjectId(dto.userId),
      type: dto.type,
      title: dto.title,
      message: dto.message,
      priority: dto.priority || NotificationPriority.MEDIUM,
      metadata: dto.metadata || {},
      actionUrl: dto.actionUrl,
      icon: dto.icon,
      isRead: false,
    });
  }

  // ─── Notify user + admin ──────────────────────────────────────

  async notifyUserAndAdmin(
    userId: string,
    dto: Omit<CreateNotificationDto, 'userId'>,
    sendEmail = false,
    emailSubject?: string,
    emailBody?: string,
  ) {
    // 1. Create notification for user
    await this.create({ ...dto, userId });

    // 2. Create notification for all admins
    const admins = await this.userModel
      .find({ role: 'admin' })
      .select('_id email name')
      .lean();

    for (const admin of admins) {
      if (admin._id.toString() === userId) continue;
      await this.create({
        ...dto,
        userId: admin._id.toString(),
        title: `[User] ${dto.title}`,
      });
    }

    // 3. Send email if requested
    if (sendEmail) {
      const user = await this.userModel
        .findById(userId)
        .select('email name')
        .lean();

      if (user) {
        await this.emailService.sendEmail(
          (user as any).email,
          emailSubject || dto.title,
          this.simpleTemplate((user as any).name, emailBody || dto.message),
        );

        for (const admin of admins) {
          if (admin._id.toString() === userId) continue;
          await this.emailService.sendEmail(
            (admin as any).email,
            `[Admin Alert] ${emailSubject || dto.title}`,
            this.simpleTemplate((admin as any).name, `User: ${(user as any).name} (${(user as any).email})\n\n${emailBody || dto.message}`),
          ).catch(() => {});
        }
      }
    } else {
      // Always alert admin
      const user = await this.userModel.findById(userId).select('email name').lean();
      for (const admin of admins) {
        if (admin._id.toString() === userId) continue;
        await this.emailService.sendEmail(
          (admin as any).email,
          `[Admin Alert] ${dto.title}`,
          this.simpleTemplate((admin as any).name, `User: ${(user as any)?.name} (${(user as any)?.email})\n\n${dto.message}`),
        ).catch(() => {});
      }
    }
  }

  // ─── Event helpers ────────────────────────────────────────────

  async onPipelineStarted(userId: string, title: string, niche: string) {
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.PIPELINE_STARTED,
      title: 'Pipeline started',
      message: `Your YouTube pipeline has started running for topic: "${title}". This takes 60-90 minutes.`,
      priority: NotificationPriority.MEDIUM,
      icon: '🚀',
      actionUrl: '/dashboard/pipeline',
      metadata: { title, niche },
    });
  }

  async onPipelineComplete(userId: string, title: string, youtubeUrl: string, durationMins: number, cost: number) {
    const emailBody = `Your YouTube pipeline completed successfully!\n\nVideo title: ${title}\nYouTube URL: ${youtubeUrl}\nCost: $${cost.toFixed(2)}`;
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.PIPELINE_COMPLETE,
      title: 'Pipeline complete ✅',
      message: `"${title}" has been uploaded to YouTube. Cost: $${cost.toFixed(2)}`,
      priority: NotificationPriority.HIGH,
      icon: '✅',
      actionUrl: youtubeUrl || '/dashboard/pipeline',
      metadata: { title, youtubeUrl, durationMins, cost },
    }, true, `✅ Video uploaded: ${title}`, emailBody);
  }

  async onPipelineFailed(userId: string, title: string, error: string, step: string) {
    const emailBody = `Your YouTube pipeline failed.\n\nFailed at: ${step}\nError: ${error}\n\nPlease check your API keys and try again.`;
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.PIPELINE_FAILED,
      title: 'Pipeline failed ❌',
      message: `Pipeline failed at ${step}: ${error.slice(0, 100)}`,
      priority: NotificationPriority.HIGH,
      icon: '❌',
      actionUrl: '/dashboard/pipeline',
      metadata: { title, error, step },
    }, true, `❌ Pipeline failed: ${title}`, emailBody);
  }

  async onAgentCreated(userId: string, agentName: string, niche: string) {
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.AGENT_CREATED,
      title: 'Agent created',
      message: `Your agent "${agentName}" has been created with niche: ${niche}`,
      priority: NotificationPriority.LOW,
      icon: '🤖',
      actionUrl: '/dashboard/agents',
      metadata: { agentName, niche },
    });
  }

  async onAgentDeleted(userId: string, agentName: string) {
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.AGENT_DELETED,
      title: 'Agent deleted',
      message: `Agent "${agentName}" has been permanently deleted.`,
      priority: NotificationPriority.LOW,
      icon: '🗑️',
      actionUrl: '/dashboard/agents',
      metadata: { agentName },
    });
  }

  async onApiKeyAdded(userId: string, provider: string, label: string) {
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.API_KEY_ADDED,
      title: 'API key added',
      message: `${label} key has been securely saved and encrypted.`,
      priority: NotificationPriority.LOW,
      icon: '🔑',
      actionUrl: '/dashboard/api-keys',
      metadata: { provider, label },
    });
  }

  async onApiKeyDeleted(userId: string, provider: string, label: string) {
    await this.notifyUserAndAdmin(userId, {
      type: NotificationType.API_KEY_DELETED,
      title: 'API key removed',
      message: `${label} key has been removed. Automations using it will stop working.`,
      priority: NotificationPriority.MEDIUM,
      icon: '⚠️',
      actionUrl: '/dashboard/api-keys',
      metadata: { provider, label },
    });
  }

  async onUserRegistered(newUserId: string, name: string, email: string) {
    const admins = await this.userModel.find({ role: 'admin' }).select('_id email name').lean();
    for (const admin of admins) {
      await this.create({
        userId: (admin as any)._id.toString(),
        type: NotificationType.USER_REGISTERED,
        title: 'New user registered',
        message: `${name} (${email}) just created an account.`,
        priority: NotificationPriority.MEDIUM,
        icon: '👤',
        actionUrl: '/admin/users',
        metadata: { name, email, newUserId },
      });
      // await this.emailService.sendEmail(
      //   (admin as any).email,
      //   `New user: ${name}`,
      //   this.simpleTemplate((admin as any).name, `A new user has registered.\n\nName: ${name}\nEmail: ${email}`),
      // ).catch(() => {});
    }
  }

  // ─── Query methods ────────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { userId: new Types.ObjectId(userId), isDeleted: { $ne: true } };
    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ ...filter, isRead: false }),
    ]);
    return { notifications, total, unreadCount, page, limit };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
      { isRead: true }, { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    return this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false, isDeleted: { $ne: true } },
      { isRead: true },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
      isDeleted: { $ne: true },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
      { isDeleted: true }, { new: true },
    );
  }

  async clearAll(userId: string) {
    return this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isDeleted: true },
    );
  }

  // ─── Simple email template ────────────────────────────────────
  private simpleTemplate(name: string, body: string): string {
    return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:20px 28px;">
  <span style="color:white;font-size:18px;font-weight:700;">Logic<span style="color:#c4b5fd;">Mate</span></span>
</td></tr>
<tr><td style="padding:28px;">
  <p style="color:#e5e5e5;font-size:15px;margin:0 0 12px;">Hi ${name},</p>
  <p style="color:#a3a3a3;font-size:14px;line-height:1.7;margin:0;white-space:pre-line;">${body.replace(/\n/g, '<br>')}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="color:#404040;font-size:12px;margin:0;">© ${new Date().getFullYear()} LogicMate · <a href="https://www.logicmate.io" style="color:#7c3aed;text-decoration:none;">logicmate.io</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  }
}