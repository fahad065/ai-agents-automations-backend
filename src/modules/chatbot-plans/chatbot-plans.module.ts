import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotPlansController } from './chatbot-plans.controller';
import { ChatbotPlansService } from './chatbot-plans.service';
import { ChatbotPlan, ChatbotPlanSchema } from './schemas/chatbot-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatbotPlan.name, schema: ChatbotPlanSchema }]),
  ],
  controllers: [ChatbotPlansController],
  providers: [ChatbotPlansService],
  exports: [ChatbotPlansService],
})
export class ChatbotPlansModule {}
