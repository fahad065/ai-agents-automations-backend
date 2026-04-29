import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserModulesService } from './usermodules.service';

@Injectable()
export class UserModulesCron {
  constructor(private readonly service: UserModulesService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledModules() {
    console.log('[Cron] Running scheduled modules check...');
    await this.service.runScheduledModules();
  }
}