import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserModulesService } from './usermodules.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class TrialExpiryCron {
  private readonly logger = new Logger(TrialExpiryCron.name);

  constructor(
    private readonly service: UserModulesService,
    private readonly emailService: EmailService,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  // Runs every day at 9 AM UTC
  @Cron('0 9 * * *')
  async checkExpiringTrials() {
    this.logger.log('[TrialCron] Checking expiring trials...');
    try {
      // Day 27 warning (3 days left) — claim each module atomically
      // (flip trialReminderSent BEFORE sending) so two replicas racing
      // this cron in the same minute can't both send the reminder for
      // the same module; only the claim that actually flips false→true
      // proceeds to email.
      let warned = 0;
      const expiring = await this.service.getExpiringSoon(3);
      for (const module of expiring) {
        const user = (module as any).userId;
        if (!user?.email) continue;
        const claimed = await this.service.claimReminderSent(module._id.toString());
        if (!claimed) continue; // another replica already claimed it
        const daysLeft = Math.ceil(
          (new Date(module.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        await this.emailService.sendTrialExpiringEmail(
          { name: user.name, email: user.email },
          { moduleName: module.moduleName, daysLeft, trialEndDate: module.trialEndDate }
        );
        warned++;
        this.logger.log(`[TrialCron] Expiry warning sent to ${user.email}`);
      }

      // Expired trials — same claim-before-send pattern, atomically
      // flipping status TRIAL→EXPIRED before notifying.
      let expiredCount = 0;
      const expired = await this.service.getExpired();
      for (const module of expired) {
        const user = (module as any).userId;
        if (!user?.email) continue;
        const claimed = await this.service.claimExpireModule(module._id.toString());
        if (!claimed) continue; // another replica already claimed it
        await this.emailService.sendTrialExpiredEmail(
          { name: user.name, email: user.email },
          { moduleName: module.moduleName }
        );
        expiredCount++;
        this.logger.log(`[TrialCron] Expired + paused: ${module.moduleName} for ${user.email}`);
      }

      this.logger.log(`[TrialCron] ✓ Warned: ${warned}, Expired: ${expiredCount}`);
    } catch (e) {
      this.logger.error(`[TrialCron] Error: ${e.message}`);
    }
  }

  @Cron('0 10 * * *')
  async sendWelcomeSequence() {
    this.logger.log('[WelcomeCron] Running welcome email sequence...');
    try {
      const now = new Date();

      // Day 1 — 24 hours after signup. Claims each user atomically
      // (welcomeDay1Sent false→true via findOneAndUpdate) before sending —
      // without this, running 2+ replicas would send every welcome email
      // to every matching user TWICE, once per instance, every single
      // day (this cron has no built-in cross-instance coordination and,
      // unlike the reminder crons above, had no "already sent" guard at
      // all before this fix).
      const day1Candidates = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
        welcomeDay1Sent: { $ne: true },
      }).select('_id name email').lean();
      let day1Sent = 0;
      for (const user of day1Candidates) {
        const claimed = await this.userModel.findOneAndUpdate(
          { _id: (user as any)._id, welcomeDay1Sent: { $ne: true } },
          { $set: { welcomeDay1Sent: true } },
        );
        if (!claimed) continue;
        await this.emailService.sendDay1Email({ name: (user as any).name, email: (user as any).email });
        day1Sent++;
        this.logger.log(`[WelcomeCron] Day 1 sent to ${(user as any).email}`);
      }

      // Day 3
      const day3Candidates = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
        welcomeDay3Sent: { $ne: true },
      }).select('_id name email').lean();
      let day3Sent = 0;
      for (const user of day3Candidates) {
        const claimed = await this.userModel.findOneAndUpdate(
          { _id: (user as any)._id, welcomeDay3Sent: { $ne: true } },
          { $set: { welcomeDay3Sent: true } },
        );
        if (!claimed) continue;
        await this.emailService.sendDay3Email({ name: (user as any).name, email: (user as any).email });
        day3Sent++;
        this.logger.log(`[WelcomeCron] Day 3 sent to ${(user as any).email}`);
      }

      // Day 7
      const day7Candidates = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
        welcomeDay7Sent: { $ne: true },
      }).select('_id name email').lean();
      let day7Sent = 0;
      for (const user of day7Candidates) {
        const claimed = await this.userModel.findOneAndUpdate(
          { _id: (user as any)._id, welcomeDay7Sent: { $ne: true } },
          { $set: { welcomeDay7Sent: true } },
        );
        if (!claimed) continue;
        await this.emailService.sendDay7Email({ name: (user as any).name, email: (user as any).email });
        day7Sent++;
        this.logger.log(`[WelcomeCron] Day 7 sent to ${(user as any).email}`);
      }

      this.logger.log(`[WelcomeCron] ✓ Day1: ${day1Sent}, Day3: ${day3Sent}, Day7: ${day7Sent}`);
    } catch (e) {
      this.logger.error(`[WelcomeCron] Error: ${e.message}`);
    }
  }
}