import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

export enum ApiKeyProvider {
  ATLAS_SEEDANCE = 'atlas_seedance',
  YOUTUBE_DATA = 'youtube_data',
  YOUTUBE_OAUTH = 'youtube_oauth',
  OPENAI = 'openai',
  ELEVENLABS = 'elevenlabs',
  CANVA = 'canva',
  BUFFER = 'buffer',
  OLLAMA = 'ollama',
}

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserAgent' })
  agentId?: Types.ObjectId;

  @Prop({ enum: ApiKeyProvider, required: true })
  provider: ApiKeyProvider;

  @Prop({ required: true })
  label: string;

  // Encrypted value stored here
  @Prop({ required: true, select: false })
  encryptedKey: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUsedAt?: Date;

  @Prop()
  expiresAt?: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ userId: 1, provider: 1 });