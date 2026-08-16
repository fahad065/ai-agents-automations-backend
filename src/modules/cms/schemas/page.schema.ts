import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PageDocument = Page & Document;

export enum PageSlug {
  ABOUT = 'about',
  CONTACT = 'contact',
  PRIVACY = 'privacy',
  TERMS = 'terms',
  COOKIES = 'cookies',
  FAQ = 'faq',
  REFUND = 'refund',
}

@Schema({ _id: false })
export class FaqItem {
  @Prop() question: string;
  @Prop() question_ar?: string;
  @Prop() answer: string;
  @Prop() answer_ar?: string;
  @Prop({ default: 0 }) order: number;
}

@Schema({ _id: false })
export class ContactInfo {
  @Prop() email: string;
  @Prop() supportEmail: string;
  @Prop() twitter: string;
  @Prop() linkedin: string;
  @Prop() address: string;
  @Prop() address_ar?: string;
}

@Schema({ _id: false })
export class TeamMember {
  @Prop() name: string;
  @Prop() role: string;
  @Prop() role_ar?: string;
  @Prop() bio: string;
  @Prop() bio_ar?: string;
  @Prop() avatar: string;
}

@Schema({ timestamps: true })
export class Page {
  @Prop({ enum: PageSlug, required: true, unique: true })
  slug: PageSlug;

  @Prop({ required: true })
  title: string;

  @Prop()
  title_ar?: string;

  @Prop()
  subtitle: string;

  @Prop()
  subtitle_ar?: string;

  @Prop()
  metaTitle: string;

  @Prop()
  metaTitle_ar?: string;

  @Prop()
  metaDescription: string;

  @Prop()
  metaDescription_ar?: string;

  // Rich text content — stored as HTML string
  @Prop({ type: String })
  content: string;

  @Prop({ type: String })
  content_ar?: string;

  // Structured data for special pages
  @Prop({ type: [Object], default: [] })
  faqItems: FaqItem[];   // { question, answer, order }

  @Prop({ type: [Object], default: [] })
  faqItems_ar: FaqItem[]; // Arabic FAQ items (same structure)

  @Prop({ type: [Object], default: [] })
  teamMembers: TeamMember[];

  @Prop({ type: Object })
  contactInfo: ContactInfo;

  @Prop({ default: true })
  isPublished: boolean;

  @Prop()
  lastEditedBy: string;
}

export const PageSchema = SchemaFactory.createForClass(Page);
PageSchema.index({ slug: 1 }, { unique: true });