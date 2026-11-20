import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KnowledgeBaseDocument = KnowledgeBase & Document;

// A photo or PDF stored in R2 (see chatbots/knowledge-media.ts).
@Schema({ _id: false })
export class KnowledgeAttachmentDoc {
  @Prop({ enum: ['image', 'pdf'], required: true })
  kind: 'image' | 'pdf';

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  name: string;

  @Prop()
  size: number;

  @Prop()
  contentType: string;
}
const KnowledgeAttachmentSchema = SchemaFactory.createForClass(KnowledgeAttachmentDoc);

@Schema({ timestamps: true })
export class KnowledgeBase {
  @Prop({ type: Types.ObjectId, ref: 'ChatbotUserService', required: true })
  userserviceId: Types.ObjectId;

  @Prop({ enum: ['text', 'faq', 'url'], required: true })
  type: 'text' | 'faq' | 'url';

  @Prop()
  question?: string;

  @Prop()
  answer?: string;

  @Prop()
  content?: string;

  // The link the bot shares with this answer (Google Maps location, menu,
  // booking page…). On an faq it can stand alone ("link-only" answer) or
  // sit next to the answer text. See chat/knowledge-format.ts.
  @Prop()
  sourceUrl?: string;

  // What the link is, shown to the AI as "<label>: <url>"
  // (e.g. "Google Maps location", "Menu (PDF)").
  @Prop()
  linkLabel?: string;

  // Photos (up to 5) and one PDF brochure shown with this answer in the
  // website chat.
  @Prop({ type: [KnowledgeAttachmentSchema], default: [] })
  attachments: KnowledgeAttachmentDoc[];

  @Prop({ type: [Number], default: [], select: false })
  embedding: number[];
}

export const KnowledgeBaseSchema = SchemaFactory.createForClass(KnowledgeBase);
KnowledgeBaseSchema.index({ userserviceId: 1 });
