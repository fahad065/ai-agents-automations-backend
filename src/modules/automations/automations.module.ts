import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import {
  AutomationTemplate,
  AutomationTemplateSchema,
} from './schemas/automation-template.schema';
import {
  UserAutomation,
  UserAutomationSchema,
} from './schemas/user-automation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutomationTemplate.name, schema: AutomationTemplateSchema },
      { name: UserAutomation.name, schema: UserAutomationSchema },
    ]),
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}