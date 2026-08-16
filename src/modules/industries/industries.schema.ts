import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IndustryDocument = Industry & Document;

@Schema({ timestamps: true, collection: 'industries' })
export class Industry {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;           // e.g. 'real_estate'

  @Prop({ required: true })
  name: string;           // e.g. 'Real Estate'

  @Prop()
  name_ar?: string;       // e.g. 'العقارات'

  @Prop({ default: '🏢' })
  icon: string;

  @Prop({ default: '#7c3aed' })
  color: string;

  @Prop()
  description?: string;

  @Prop()
  description_ar?: string;

  // Default modules (agents/automations) included in this industry bundle
  // Admin sets these — users get all of them when they subscribe
  @Prop({ type: [Types.ObjectId], ref: 'ModuleTemplate', default: [] })
  defaultModuleIds: Types.ObjectId[];

  @Prop({ type: [String], default: ['UAE', 'Kenya'] })
  availableIn: string[];

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const IndustrySchema = SchemaFactory.createForClass(Industry);
IndustrySchema.index({ availableIn: 1 });
IndustrySchema.index({ isActive: 1 });
IndustrySchema.index({ sortOrder: 1 });
