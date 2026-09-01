import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotsController } from './chatbots.controller';
import { ChatbotsService } from './chatbots.service';
import { Chatbot, ChatbotSchema } from './schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseSchema } from './schemas/knowledge-base.schema';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { ModulesModule } from '../modules/modules.module';
import { ChatbotBillingCron } from './chatbot-billing.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Chatbot.name, schema: ChatbotSchema },
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ApiKeysModule,
    BillingModule,
    EmailModule,
    ModulesModule,
  ],
  controllers: [ChatbotsController],
  providers: [ChatbotsService, ChatbotBillingCron],
  exports: [ChatbotsService],
})
export class ChatbotsModule {}
