import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chatbot, ChatbotDocument } from './schemas/chatbot.schema';
import { EmailService } from '../email/email.service';

// Runs the same job the agents/automations side already has (see
// usermodules/trial-expiry.cron.ts) but for chatbots: warn 5 days before a
// trial ends (day 25 of a 30-day trial), then flip billing.status once it
// actually does. The chat engine (chat.service.ts) also re-checks
// trialEndsAt in real time via isChatbotBillingActive(), so a lapsed trial
// can never answer for free just because this cron hasn't run yet today —
// this job's job is emails + moving the status forward, not the actual
// gate. Uses sendChatbotTrialExpiringEmail()/sendChatbotTrialExpiredEmail()
// (email.service.ts) — chatbot-specific versions of the generic
// agents/automations emails, since those link to the generic
// /dashboard/payment-instructions page (which has no idea which chatbot or
// fee is owed) instead of this bot's own Billing tab, where the real
// amount, bank details, and the notify-payment "I've paid" form live.
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

    // 5-day warning
    try {
      const fiveDaysOut = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const expiring = await this.chatbotModel.find({
        'billing.status': 'trial',
        'billing.trialEndsAt': { $lte: fiveDaysOut, $gt: new Date() },
        'billing.trialReminderSent': { $ne: true },
      });

      for (const chatbot of expiring) {
        const user: any = await this.userModel.findById(chatbot.userId).lean();
        if (!user?.email) continue;
        const daysLeft = Math.ceil(
          (new Date(chatbot.billing.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        await this.emailService.sendChatbotTrialExpiringEmail(
          { name: user.name, email: user.email },
          {
            chatbotId: String(chatbot._id),
            chatbotName: chatbot.name,
            daysLeft,
            trialEndDate: chatbot.billing.trialEndsAt!,
            monthlyFee: chatbot.billing.monthlyFee,
            setupFee: chatbot.billing.setupFee,
            currency: chatbot.billing.currency,
          },
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
          await this.emailService.sendChatbotTrialExpiredEmail(
            { name: user.name, email: user.email },
            {
              chatbotId: String(chatbot._id),
              chatbotName: chatbot.name,
              monthlyFee: chatbot.billing.monthlyFee,
              setupFee: chatbot.billing.setupFee,
              currency: chatbot.billing.currency,
            },
          );
        }
        this.logger.log(`[ChatbotBillingCron] Trial expired for chatbot=${chatbot._id} -> ${chatbot.billing.status}`);
      }
    } catch (err) {
      this.logger.error(`[ChatbotBillingCron] expiry pass failed: ${err?.message}`);
    }
  }
}
