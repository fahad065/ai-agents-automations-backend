import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentTemplate, AgentTemplateSchema } from './schemas/agent-template.schema';
import { UserAgent, UserAgentSchema } from './schemas/user-agent.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentTemplate.name, schema: AgentTemplateSchema },
      { name: UserAgent.name, schema: UserAgentSchema },
    ]),
    NotificationsModule
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService, MongooseModule],
})
export class AgentsModule {}