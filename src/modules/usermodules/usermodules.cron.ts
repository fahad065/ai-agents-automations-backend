import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserModulesService } from './usermodules.service';
 
@Injectable()
export class UserModulesCron {
  private readonly logger = new Logger(UserModulesCron.name);
 
  constructor(private readonly service: UserModulesService) {}
 
  @Cron('* * * * *')
  async runScheduledModules() {
    try {
      const result = await this.service.runScheduledModules();
      if (result.ran > 0) {
        this.logger.log(`[Cron] ✓ Ran ${result.ran} pipelines`);
      }
    } catch (err) {
      this.logger.error(`[Cron] Error: ${err.message}`);
    }
  }
}