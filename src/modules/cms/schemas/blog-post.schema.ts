import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BlogPostDocument = BlogPost & Document;

export enum BlogCategory {
  PRODUCT = 'product',
  TUTORIAL = 'tutorial',
  CASE_STUDY = 'case-study',
  NEWS = 'news',
  TIPS = 'tips',
}

@Schema({ timestamps: true })
export class BlogPost {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  excerpt: string;

  @Prop({ type: String })
  content: string;

  @Prop()
  coverImage: string;

  @Prop({ enum: BlogCategory, default: BlogCategory.PRODUCT })
  category: BlogCategory;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  authorId: Types.ObjectId;

  @Prop()
  authorName: string;

  @Prop({ default: false })
  isPublished: boolean;

  @Prop()
  publishedAt: Date;

  @Prop({ default: 0 })
  readTimeMinutes: number;

  @Prop({ default: 0 })
  viewCount: number;

  @Prop()
  metaTitle: string;

  @Prop()
  metaDescription: string;
}

export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);
BlogPostSchema.index({ slug: 1 }, { unique: true });
BlogPostSchema.index({ isPublished: 1, publishedAt: -1 });
BlogPostSchema.index({ category: 1, isPublished: 1 });