import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chatbot, ChatbotDocument } from './schemas/chatbot.schema';
import { EmailService } from '../email/email.service';

// Runs the same job the agents/automations side already has (see
// usermodules/trial-expiry.cron.ts) but for chatbots: warn 3 days before a
// trial ends, then flip billing.status once it actually does. The chat
// engine (chat.service.ts) also re-checks trialEndsAt in real time via
// isChatbotBillingActive(), so a lapsed trial can never answer for free
// just because this cron hasn't run yet today — this job's job is emails
// + moving the status forward, not the actual gate.
@Injectable()
export class ChatbotBillingCron {
  private readonly logger = new Logger(ChatbotBillingCron.name);

  constructor(
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel('User') private userModel: Model<any>,
    private emailService: EmailService,
  ) {}

  // Staggered from the 9 AM usermodules trial cron to avoid both hitting Mongo at once.
  @Cron('0 10 * * *')
  async checkChatbotTrials() {
    this.logger.log('[ChatbotBillingCron] Checking chatbot trials...');

    // 3-day warning
    try {
      const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const expiring = await this.chatbotModel.find({
        'billing.status': 'trial',
        'billing.trialEndsAt': { $lte: threeDaysOut, $gt: new Date() },
        'billing.trialReminderSent': { $ne: true },
      });

      for (const chatbot of expiring) {
        const user: any = await this.userModel.findById(chatbot.userId).lean();
        if (!user?.email) continue;
        const daysLeft = Math.ceil(
          (new Date(chatbot.billing.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        await this.emailService.sendTrialExpiringEmail(
          { name: user.name, email: user.email },
          { moduleName: chatbot.name, daysLeft, trialEndDate: chatbot.billing.trialEndsAt! },
        );
        chatbot.billing.trialReminderSent = true;
        await chatbot.save();
        this.logger.log(`[ChatbotBillingCron] Expiry warning sent for chatbot=${chatbot._id}`);
      }
    } catch (err) {
      this.logger.error(`[ChatbotBillingCron] warning pass failed: ${err?.message}`);
    }

    // Expired trials
    try {
      const expired = await this.chatbotModel.find({
        'billing.status': 'trial',
        'billing.trialEndsAt': { $lte: new Date() },
      });

      for (const chatbot of expired) {
        chatbot.billing.status =
          chatbot.billing.setupFee > 0 || chatbot.billing.monthlyFee > 0
            ? 'awaiting_setup_payment'
            : 'suspended';
        await chatbot.save();

        const user: any = await this.userModel.findById(chatbot.userId).lean();
        if (user?.email) {
          await this.emailService.sendTrialExpiredEmail(
            { name: user.name, email: user.email },
            { moduleName: chatbot.name },
          );
        }
        this.logger.log(`[ChatbotBillingCron] Trial expired for chatbot=${chatbot._id} -> ${chatbot.billing.status}`);
      }
    } catch (err) {
      this.logger.error(`[ChatbotBillingCron] expiry pass failed: ${err?.message}`);
    }
  }
}
