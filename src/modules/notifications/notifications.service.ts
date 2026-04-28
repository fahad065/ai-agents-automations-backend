import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import {
  Notification,
  NotificationDocument,
  NotificationType,
  NotificationPriority,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

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
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {
    // Gmail SMTP transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

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
      // Don't double-notify if user is admin
      if (admin._id.toString() === userId) continue;

      await this.create({
        ...dto,
        userId: admin._id.toString(),
        // Prefix admin notifications to distinguish them
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
        // Email to user
        await this.sendEmail(
          user.email,
          emailSubject || dto.title,
          emailBody || dto.message,
          user.name,
        );

        // Email to all admins
        for (const admin of admins) {
          if (admin._id.toString() === userId) continue;
          await this.sendEmail(
            admin.email,
            `[Admin Alert] ${emailSubject || dto.title}`,
            `User: ${user.name} (${user.email})\n\n${emailBody || dto.message}`,
            admin.name,
          );
        }
      }
    } else {
      // Always email admin even if not sending to user
      const user = await this.userModel
        .findById(userId)
        .select('email name')
        .lean();

      for (const admin of admins) {
        if (admin._id.toString() === userId) continue;
        await this.sendEmail(
          admin.email,
          `[Admin Alert] ${dto.title}`,
          `User: ${user?.name} (${user?.email})\n\n${dto.message}`,
          admin.name,
        ).catch(() => {}); // Non-critical — don't throw
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

  async onPipelineComplete(
    userId: string,
    title: string,
    youtubeUrl: string,
    durationMins: number,
    cost: number,
  ) {
    const emailBody = `
Your YouTube pipeline completed successfully!

Video title: ${title}
YouTube URL: ${youtubeUrl}
Duration: ${durationMins.toFixed(1)} minutes
Cost: $${cost.toFixed(2)}

Your video has been uploaded and scheduled on YouTube.
    `.trim();

    await this.notifyUserAndAdmin(
      userId,
      {
        type: NotificationType.PIPELINE_COMPLETE,
        title: 'Pipeline complete ✅',
        message: `"${title}" has been uploaded to YouTube successfully. Cost: $${cost.toFixed(2)}`,
        priority: NotificationPriority.HIGH,
        icon: '✅',
        actionUrl: youtubeUrl || '/dashboard/pipeline',
        metadata: { title, youtubeUrl, durationMins, cost },
      },
      true,
      `✅ Video uploaded: ${title}`,
      emailBody,
    );
  }

  async onPipelineFailed(userId: string, title: string, error: string, step: string) {
    const emailBody = `
Your YouTube pipeline failed.

Video title: ${title}
Failed at: ${step}
Error: ${error}

Please check your API keys and try again from the Pipeline Monitor.
    `.trim();

    await this.notifyUserAndAdmin(
      userId,
      {
        type: NotificationType.PIPELINE_FAILED,
        title: 'Pipeline failed ❌',
        message: `Pipeline failed at ${step}: ${error.slice(0, 100)}`,
        priority: NotificationPriority.HIGH,
        icon: '❌',
        actionUrl: '/dashboard/pipeline',
        metadata: { title, error, step },
      },
      true,
      `❌ Pipeline failed: ${title}`,
      emailBody,
    );
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
    // Only notify admins
    const admins = await this.userModel
      .find({ role: 'admin' })
      .select('_id email name')
      .lean();

    for (const admin of admins) {
      await this.create({
        userId: admin._id.toString(),
        type: NotificationType.USER_REGISTERED,
        title: 'New user registered',
        message: `${name} (${email}) just created an account.`,
        priority: NotificationPriority.MEDIUM,
        icon: '👤',
        actionUrl: '/admin/users',
        metadata: { name, email, newUserId },
      });

      await this.sendEmail(
        admin.email,
        `New user: ${name}`,
        `A new user has registered.\n\nName: ${name}\nEmail: ${email}\n\nView in admin panel: /admin/users`,
        admin.name,
      ).catch(() => {});
    }
  }

  // ─── Query methods ────────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = {
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },  // exclude soft deleted
    };
  
    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({
        ...filter,
        isRead: false,
      }),
    ]);
  
    return { notifications, total, unreadCount, page, limit };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { isRead: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    return this.notificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false,
        isDeleted: { $ne: true },
      },
      { isRead: true },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
      isDeleted: { $ne: true },  // exclude soft deleted
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    // Soft delete — set isDeleted: true instead of removing document
    return this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { isDeleted: true },
      { new: true },
    );
  }
  
  async clearAll(userId: string) {
    // Soft delete all — set isDeleted: true on all user notifications
    return this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isDeleted: true },
    );
  }

  // ─── Email helper ─────────────────────────────────────────────

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
    recipientName: string,
  ): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 24px 32px; }
    .header h1 { color: white; font-size: 20px; font-weight: 700; margin: 0; }
    .header p { color: rgba(255,255,255,0.7); font-size: 13px; margin: 4px 0 0; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 15px; color: #e5e5e5; margin-bottom: 16px; }
    .message { font-size: 14px; color: #a3a3a3; line-height: 1.7; white-space: pre-line; }
    .footer { padding: 20px 32px; border-top: 1px solid #222; }
    .footer p { font-size: 12px; color: #525252; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ LogicMate</h1>
      <p>AI Automation Platform</p>
    </div>
    <div class="body">
      <p class="greeting">Hi ${recipientName},</p>
      <p class="message">${body.replace(/\n/g, '<br>')}</p>
    </div>
    <div class="footer">
      <p>LogicMate · AI Automation Platform · You're receiving this because you have an account.</p>
    </div>
  </div>
</body>
</html>`;

    await this.transporter.sendMail({
      from: `"LogicMate" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: body,
      html,
    });
  }
}