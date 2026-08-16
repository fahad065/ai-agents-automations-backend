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
      // Day 27 warning (3 days left)
      const expiring = await this.service.getExpiringSoon(3);
      for (const module of expiring) {
        const user = (module as any).userId;
        if (!user?.email) continue;
        const daysLeft = Math.ceil(
          (new Date(module.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        await this.emailService.sendTrialExpiringEmail(
          { name: user.name, email: user.email },
          { moduleName: module.moduleName, daysLeft, trialEndDate: module.trialEndDate }
        );
        await this.service.markReminderSent(module._id.toString());
        this.logger.log(`[TrialCron] Expiry warning sent to ${user.email}`);
      }

      // Expired trials — pause and notify
      const expired = await this.service.getExpired();
      for (const module of expired) {
        const user = (module as any).userId;
        if (!user?.email) continue;
        await this.service.expireModule(module._id.toString());
        await this.emailService.sendTrialExpiredEmail(
          { name: user.name, email: user.email },
          { moduleName: module.moduleName }
        );
        this.logger.log(`[TrialCron] Expired + paused: ${module.moduleName} for ${user.email}`);
      }

      this.logger.log(`[TrialCron] ✓ Warned: ${expiring.length}, Expired: ${expired.length}`);
    } catch (e) {
      this.logger.error(`[TrialCron] Error: ${e.message}`);
    }
  }

  @Cron('0 10 * * *')
  async sendWelcomeSequence() {
    this.logger.log('[WelcomeCron] Running welcome email sequence...');
    try {
      const now = new Date();

      // Day 1 — 24 hours after signup
      const day1Users = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
      }).lean();
      for (const user of day1Users) {
        await this.emailService.sendDay1Email({ name: (user as any).name, email: (user as any).email });
        this.logger.log(`[WelcomeCron] Day 1 sent to ${(user as any).email}`);
      }

      // Day 3
      const day3Users = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
      }).lean();
      for (const user of day3Users) {
        await this.emailService.sendDay3Email({ name: (user as any).name, email: (user as any).email });
        this.logger.log(`[WelcomeCron] Day 3 sent to ${(user as any).email}`);
      }

      // Day 7
      const day7Users = await this.userModel.find({
        createdAt: {
          $gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
        isDeleted: { $ne: true },
      }).lean();
      for (const user of day7Users) {
        await this.emailService.sendDay7Email({ name: (user as any).name, email: (user as any).email });
        this.logger.log(`[WelcomeCron] Day 7 sent to ${(user as any).email}`);
      }

      this.logger.log(`[WelcomeCron] ✓ Day1: ${day1Users.length}, Day3: ${day3Users.length}, Day7: ${day7Users.length}`);
    } catch (e) {
      this.logger.error(`[WelcomeCron] Error: ${e.message}`);
    }
  }
}