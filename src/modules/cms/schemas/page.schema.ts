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
}

@Schema({ _id: false })
export class FaqItem {
  @Prop() question: string;
  @Prop() answer: string;
  @Prop({ default: 0 }) order: number;
}

@Schema({ _id: false })
export class ContactInfo {
  @Prop() email: string;
  @Prop() supportEmail: string;
  @Prop() twitter: string;
  @Prop() linkedin: string;
  @Prop() address: string;
}

@Schema({ _id: false })
export class TeamMember {
  @Prop() name: string;
  @Prop() role: string;
  @Prop() bio: string;
  @Prop() avatar: string;
}

@Schema({ timestamps: true })
export class Page {
  @Prop({ enum: PageSlug, required: true, unique: true })
  slug: PageSlug;

  @Prop({ required: true })
  title: string;

  @Prop()
  subtitle: string;

  @Prop()
  metaTitle: string;

  @Prop()
  metaDescription: string;

  // Rich text content — stored as HTML string
  @Prop({ type: String })
  content: string;

  // Structured data for special pages
  @Prop({ type: [Object], default: [] })
  faqItems: FaqItem[];

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