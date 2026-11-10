import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountDeletionService } from './account-deletion.service';

@Injectable()
export class AccountDeletionCron {
  private readonly logger = new Logger(AccountDeletionCron.name);

  constructor(private accountDeletionService: AccountDeletionService) {}

  // Early morning, staggered from the other daily crons (usermodules at
  // 9 AM, chatbot billing at 10 AM) — runs before either, since this one
  // does the most destructive work and shouldn't compete with them.
  @Cron('0 3 * * *')
  async run() {
    const { sent } = await this.accountDeletionService.sendDueReminders();
    if (sent > 0) {
      this.logger.log(`[AccountDeletionCron] Sent ${sent} day-7 deletion reminder(s).`);
    }

    const { processed } = await this.accountDeletionService.performScheduledDeletions();
    if (processed > 0) {
      this.logger.log(`[AccountDeletionCron] Processed ${processed} scheduled deletion(s).`);
    }
  }
}
