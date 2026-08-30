import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotsController } from './chatbots.controller';
import { ChatbotsService } from './chatbots.service';
import { Chatbot, ChatbotSchema } from './schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseSchema } from './schemas/knowledge-base.schema';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Chatbot.name, schema: ChatbotSchema },
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    ApiKeysModule,
    BillingModule,
  ],
  controllers: [ChatbotsController],
  providers: [ChatbotsService],
  exports: [ChatbotsService],
})
export class ChatbotsModule {}
