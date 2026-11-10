import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionCron } from './account-deletion.cron';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UserModule as UserModuleSchemaClass, UserModuleSchema } from '../modules/schemas/user-module.schema';
import { Chatbot, ChatbotSchema } from '../chatbots/schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseSchema } from '../chatbots/schemas/knowledge-base.schema';
import { Conversation, ConversationSchema } from '../chatbots/schemas/conversation.schema';
import { ApiKey, ApiKeySchema } from '../api-keys/schemas/api-key.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { Billing, BillingSchema } from '../billing/schemas/billing.schema';
import { ActivityLog, ActivityLogSchema } from '../activity-logs/schemas/activity-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserModuleSchemaClass.name, schema: UserModuleSchema },
      { name: Chatbot.name, schema: ChatbotSchema },
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Billing.name, schema: BillingSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService, AccountDeletionCron],
})
export class AccountDeletionModule {}
