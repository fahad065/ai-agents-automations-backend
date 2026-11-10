import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

export enum ApiKeyProvider {
  ATLAS_SEEDANCE = 'atlas_seedance',
  YOUTUBE_DATA = 'youtube_data',
  YOUTUBE_OAUTH = 'youtube_oauth',
  OPENAI = 'openai',
  // Chat-completion-capable alongside OpenAI — see ai-provider.util.ts for
  // the actual request/response adapters per provider. Anthropic has no
  // embeddings API at all, so it's never valid as an embeddingModelConfig
  // provider (validated in ChatbotsService) — chat-only.
  ANTHROPIC = 'anthropic',
  // Chat- AND embedding-capable (unlike Anthropic) — see ai-provider.util.ts.
  GEMINI = 'gemini',
  ELEVENLABS = 'elevenlabs',
  CANVA = 'canva',
  BUFFER = 'buffer',
  OLLAMA = 'ollama',
  INSTAGRAM_OAUTH = 'instagram_oauth',
}

export enum ApiKeyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// Matches the new architecture.md `apikeys` design. Two real changes
// from the old schema, both confirmed dead/unneeded before dropping:
// `agentId?` referenced a `UserAgent` model that doesn't exist anywhere
// in this codebase (grepped before removing — zero live callers ever
// populated it), and `expiresAt?` was declared but never read or
// written by any real code path. `isActive: boolean` -> `status` enum
// + a real `isDeleted` soft-delete flag — same status-enum-not-boolean,
// isDeleted-everywhere convention used across every other collection in
// this redesign. See ApiKeysService.onModuleInit() for the one-time
// backfill that migrates existing documents (old `isActive` -> `status`,
// adds `isDeleted: false`) without a manual script or DB access.
@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ApiKeyProvider, required: true })
  provider: ApiKeyProvider;

  @Prop({ required: true })
  label: string;

  // Encrypted value stored here — select:false so it's never returned by
  // default; never select it into activity_logs either (see rules.md #10).
  @Prop({ required: true, select: false })
  encryptedKey: string;

  @Prop({ enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  lastUsedAt?: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ userId: 1, provider: 1 });
ApiKeySchema.index({ userId: 1, isDeleted: 1, status: 1 });
