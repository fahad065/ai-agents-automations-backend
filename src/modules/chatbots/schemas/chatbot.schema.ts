import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatbotDocument = Chatbot & Document;

@Schema({ _id: false })
export class WebsiteChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  customColor?: string;

  @Prop()
  welcomeMessage?: string;

  @Prop()
  welcomeMessage_ar?: string;
}

@Schema({ _id: false })
export class WhatsappChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  phoneNumberId?: string;

  @Prop()
  accessToken?: string;

  @Prop()
  verifyToken?: string;

  @Prop({ default: false })
  webhookVerified: boolean;
}

@Schema({ _id: false })
export class InstagramChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  accountId?: string;

  @Prop()
  accessToken?: string;

  @Prop({ default: false })
  webhookVerified: boolean;
}

@Schema({ _id: false })
export class ChatbotChannels {
  @Prop({ type: WebsiteChannel, default: () => ({}) })
  website: WebsiteChannel;

  @Prop({ type: WhatsappChannel, default: () => ({}) })
  whatsapp: WhatsappChannel;

  @Prop({ type: InstagramChannel, default: () => ({}) })
  instagram: InstagramChannel;
}

@Schema({ timestamps: true })
export class Chatbot {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  persona?: string;

  @Prop({ enum: ['en', 'ar', 'both'], default: 'both' })
  language: 'en' | 'ar' | 'both';

  @Prop({
    enum: ['restaurant', 'real_estate', 'clinic', 'ecommerce', 'gym', 'education', 'custom'],
  })
  template?: string;

  @Prop({ enum: ['draft', 'active', 'inactive'], default: 'draft' })
  status: 'draft' | 'active' | 'inactive';

  @Prop({ default: "I'm not sure about that. Let me connect you with a human." })
  fallbackMessage: string;

  @Prop({ default: 'لست متأكداً من ذلك. دعني أوصلك بأحد المختصين.' })
  fallbackMessage_ar: string;

  @Prop({ default: false })
  humanHandoff: boolean;

  @Prop({ required: true, unique: true })
  embedKey: string;

  @Prop({ type: ChatbotChannels, default: () => ({}) })
  channels: ChatbotChannels;
}

export const ChatbotSchema = SchemaFactory.createForClass(Chatbot);
ChatbotSchema.index({ userId: 1 });
ChatbotSchema.index({ embedKey: 1 }, { unique: true });
