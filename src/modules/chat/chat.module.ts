import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
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
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
