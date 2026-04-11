import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UserAgent, UserAgentSchema } from '../agents/schemas/user-agent.schema';
import { AgentTemplate, AgentTemplateSchema } from '../agents/schemas/agent-template.schema';
import { ContentIdea, ContentIdeaSchema } from '../content-ideas/schemas/content-idea.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserAgent.name, schema: UserAgentSchema },
      { name: AgentTemplate.name, schema: AgentTemplateSchema },
      { name: ContentIdea.name, schema: ContentIdeaSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}