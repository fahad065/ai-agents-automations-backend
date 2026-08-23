import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KnowledgeBaseDocument = KnowledgeBase & Document;

@Schema({ timestamps: true })
export class KnowledgeBase {
  @Prop({ type: Types.ObjectId, ref: 'Chatbot', required: true })
  chatbotId: Types.ObjectId;

  @Prop({ enum: ['text', 'faq', 'url'], required: true })
  type: 'text' | 'faq' | 'url';

  @Prop()
  question?: string;

  @Prop()
  answer?: string;

  @Prop()
  content?: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ type: [Number], default: [], select: false })
  embedding: number[];
}

export const KnowledgeBaseSchema = SchemaFactory.createForClass(KnowledgeBase);
KnowledgeBaseSchema.index({ chatbotId: 1 });
