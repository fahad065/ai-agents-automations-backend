import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CmsDocument = Cms & Document;

export enum CmsType {
  PAGE = 'page',
  BLOG = 'blog',
}

export enum CmsStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// Values match what's actually saved in the `cms` collection today
// (set by hand from /dashboard/cms before this enum existed) — not the
// short form you'd guess from the enum keys. Changing these only affects
// what seed() creates and which doc the About-page backfill targets; the
// Next.js route for each page (e.g. /cookies) is a separate, unrelated
// literal folder name and is unaffected by this value.
export enum CmsPageSlug {
  ABOUT = 'about-logicmate',
  CONTACT = 'contact-us',
  PRIVACY = 'privacy-policy',
  TERMS = 'terms-of-service',
  COOKIES = 'cookie-policy',
  FAQ = 'frequently-asked-questions',
  REFUND = 'refund-policy',
}

export enum CmsBlogCategory {
  PRODUCT = 'product',
  TUTORIAL = 'tutorial',
  CASE_STUDY = 'case-study',
  NEWS = 'news',
  TIPS = 'tips',
}

// NOT a "(_ar) inline twin" like most bilingual fields in this schema —
// verified against the real frontend (cms-page.tsx's admin editor,
// faq-page.tsx's public render): FAQ items are two entirely separate
// parallel arrays, `faqItems` (English) and `faqItems_ar` (Arabic), each
// item plain {question, answer, order} with no _ar fields of its own. Do
// not "simplify" this to one array with per-item _ar fields — that would
// silently break both the admin FAQ editor and the public FAQ page, since
// neither reads that shape.
@Schema({ _id: false })
class FaqItem {
  @Prop() question: string;
  @Prop() answer: string;
  @Prop({ default: 0 }) order: number;
}

// Confirmed unread by any frontend page today (about-page.tsx's team
// section is hardcoded, not CMS-driven) — kept anyway because dropping
// real seed data (the founder's bio) to save an unused field costs
// nothing to avoid and loses something if a future page ever wants it.
@Schema({ _id: false })
class TeamMember {
  @Prop() name: string;
  @Prop() role: string;
  @Prop() role_ar?: string;
  @Prop() bio: string;
  @Prop() bio_ar?: string;
  @Prop() avatar: string;
}

@Schema({ _id: false })
class ContactInfo {
  @Prop() email: string;
  @Prop() supportEmail: string;
  @Prop() twitter: string;
  @Prop() linkedin: string;
  @Prop() address: string;
  @Prop() address_ar?: string;
}

// Page-only fields. Only populated when type === CmsType.PAGE.
@Schema({ _id: false })
class PageMeta {
  @Prop() subtitle?: string;
  @Prop() subtitle_ar?: string;

  @Prop({ type: [Object], default: [] })
  faqItems: FaqItem[];

  @Prop({ type: [Object], default: [] })
  faqItems_ar: FaqItem[];

  @Prop({ type: [Object], default: [] })
  teamMembers: TeamMember[];

  @Prop({ type: Object })
  contactInfo?: ContactInfo;
}
const PageMetaSchema = SchemaFactory.createForClass(PageMeta);

// Blog-only fields. Only populated when type === CmsType.BLOG.
@Schema({ _id: false })
class BlogMeta {
  @Prop() excerpt?: string;
  @Prop() excerpt_ar?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  authorId?: Types.ObjectId;

  @Prop() authorName?: string;

  @Prop({ enum: CmsBlogCategory, default: CmsBlogCategory.PRODUCT })
  category: CmsBlogCategory;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop() coverImage?: string;

  @Prop() publishedAt?: Date;

  @Prop({ default: 0 })
  readTimeMinutes: number;

  @Prop({ default: 0 })
  viewCount: number;
}
const BlogMetaSchema = SchemaFactory.createForClass(BlogMeta);

@Schema({ timestamps: true, collection: 'cms' })
export class Cms {
  @Prop({ enum: CmsType, required: true })
  type: CmsType;

  // Unique per type, not globally — see the compound index below. A page
  // and a blog post may legitimately share a slug; they render at
  // different URLs (/about vs /blog/about).
  @Prop({ required: true, trim: true })
  slug: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  title_ar?: string;

  // HTML string.
  @Prop({ type: String })
  content: string;

  @Prop({ type: String })
  content_ar?: string;

  @Prop()
  metaTitle?: string;

  @Prop()
  metaTitle_ar?: string;

  @Prop()
  metaDescription?: string;

  @Prop()
  metaDescription_ar?: string;

  @Prop({ enum: CmsStatus, default: CmsStatus.ACTIVE })
  status: CmsStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: PageMetaSchema })
  pageMeta?: PageMeta;

  @Prop({ type: BlogMetaSchema })
  blogMeta?: BlogMeta;

  // Admin-attribution — same purpose as today's Page.lastEditedBy: only
  // ever set by a real admin edit (never by the seed script), so its
  // absence reliably means "still exactly what the seed wrote".
  @Prop()
  lastEditedBy?: string;
}

export const CmsSchema = SchemaFactory.createForClass(Cms);

CmsSchema.index({ slug: 1, type: 1 }, { unique: true });
CmsSchema.index({ type: 1, status: 1, isDeleted: 1 });
CmsSchema.index({ type: 1, 'blogMeta.category': 1 });
