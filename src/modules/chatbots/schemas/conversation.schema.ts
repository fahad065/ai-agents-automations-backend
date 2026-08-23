import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ _id: false })
export class ChatMessage {
  @Prop({ enum: ['user', 'assistant'], required: true })
  role: 'user' | 'assistant';

  @Prop({ required: true })
  content: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;
}

const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: Types.ObjectId, ref: 'Chatbot', required: true })
  chatbotId: Types.ObjectId;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ enum: ['website', 'whatsapp', 'instagram'], default: 'website' })
  channel: 'website' | 'whatsapp' | 'instagram';

  @Prop({ type: [ChatMessageSchema], default: [] })
  messages: ChatMessage[];

  @Prop({ enum: ['active', 'closed', 'handoff'], default: 'active' })
  status: 'active' | 'closed' | 'handoff';

  @Prop()
  visitorName?: string;

  @Prop()
  visitorEmail?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ chatbotId: 1, sessionId: 1 });
ConversationSchema.index({ chatbotId: 1, createdAt: -1 });
