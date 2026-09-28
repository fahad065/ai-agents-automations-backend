import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { Chatbot, ChatbotSchema } from '../chatbots/schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseSchema } from '../chatbots/schemas/knowledge-base.schema';
import { Conversation, ConversationSchema } from '../chatbots/schemas/conversation.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Chatbot.name, schema: ChatbotSchema },
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ApiKeysModule,
    // Module-local throttler instance (separate storage from the app-wide
    // per-IP guard) — 'chat' bucket is keyed by embedKey via
    // ChatThrottlerGuard, so it tracks per-tenant usage, not per-caller-IP.
    ThrottlerModule.forRoot([{ name: 'chat', ttl: 10000, limit: 40 }]),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatThrottlerGuard],
})
export class ChatModule {}
