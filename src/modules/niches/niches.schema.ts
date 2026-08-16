import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NicheDocument = Niche & Document;

@Schema({ timestamps: true, collection: 'niches' })
export class Niche {
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

  @Prop({ type: [String], default: ['UAE', 'Kenya'] })
  availableIn: string[];  // which countries show this niche

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const NicheSchema = SchemaFactory.createForClass(Niche);
NicheSchema.index({ availableIn: 1 });
NicheSchema.index({ isActive: 1 });
NicheSchema.index({ sortOrder: 1 });
