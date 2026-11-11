import {
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import { ConfigService } from '@nestjs/config';
  import * as CryptoJS from 'crypto-js';
  import { ApiKey, ApiKeyDocument, ApiKeyProvider, ApiKeyStatus } from './schemas/api-key.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

export interface Actor {
  id: string;
  role: 'user' | 'admin';
}

// Provider is open-ended (see api-key.schema.ts) — this keeps whatever a
// user types ("Stripe Payments", "stripe-payments", "STRIPE") landing as
// the same stored provider key, regardless of casing/spacing/punctuation,
// so it's reliably matched on the next add/lookup for that same service.
function normalizeProvider(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

  @Injectable()
  export class ApiKeysService implements OnModuleInit {
    private readonly logger = new Logger(ApiKeysService.name);

    constructor(
      @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
      private config: ConfigService,
      private notificationsService: NotificationsService,
      private activityLogsService: ActivityLogsService,
    ) {}

    // Self-healing backfill (same pattern as ModulesService/ChatbotsService
    // elsewhere in this codebase) — migrates documents written before the
    // isActive -> status/isDeleted schema change, with no manual script or
    // DB access needed. Matched purely on `status` not existing yet, so a
    // doc already migrated (or newly created, which always sets `status`
    // itself) is never touched twice. `isActive`/`agentId`/`expiresAt` are
    // no longer declared on the schema but still physically present on
    // untouched old documents — this is what actually reads and clears them.
    async onModuleInit() {
      const result = await this.apiKeyModel.updateMany(
        { status: { $exists: false } } as any,
        [
          {
            $set: {
              status: {
                $cond: [{ $eq: ['$isActive', false] }, ApiKeyStatus.INACTIVE, ApiKeyStatus.ACTIVE],
              },
              isDeleted: false,
            },
          },
          { $unset: ['isActive', 'agentId', 'expiresAt'] },
        ] as any,
      );
      if (result.modifiedCount) {
        this.logger.log(`Backfilled status/isDeleted on ${result.modifiedCount} api key(s)`);
      }
    }

    private get encryptionKey() {
      return this.config.get('ENCRYPTION_KEY');
    }

    private encrypt(text: string): string {
      return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
    }

    private decrypt(cipherText: string): string {
      const bytes = CryptoJS.AES.decrypt(cipherText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    }

    async saveKey(userId: string, body: {
      provider: string;
      label: string;
      key: string;
    }, actor?: Actor) {
      const encrypted = this.encrypt(body.key);
      const provider = normalizeProvider(body.provider);
      if (!provider) {
        throw new Error('Provider is required');
      }

      // Never matches a soft-deleted doc — re-adding a provider after
      // deleting it creates a genuinely fresh record, not a resurrection.
      const existing = await this.apiKeyModel.findOne({
        userId: new Types.ObjectId(userId),
        provider,
        isDeleted: { $ne: true },
      });

      if (existing) {
        existing.encryptedKey = encrypted;
        existing.label = body.label;
        existing.status = ApiKeyStatus.ACTIVE;
        await existing.save();

        await this.activityLogsService.record({
          userId, actorId: actor?.id || userId,
          actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
          action: ActivityAction.UPDATE, entityType: 'apikey', entityId: (existing._id as Types.ObjectId).toString(),
          changes: { after: { provider, label: body.label } },
          description: `${body.label} (${provider}) key updated`,
        });

        return { message: 'Key updated', provider };
      }

      const created = await this.apiKeyModel.create({
        userId: new Types.ObjectId(userId),
        provider,
        label: body.label,
        encryptedKey: encrypted,
      });

      await this.notificationsService.onApiKeyAdded(userId, provider, body.label);

      await this.activityLogsService.record({
        userId, actorId: actor?.id || userId,
        actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
        action: ActivityAction.CREATE, entityType: 'apikey', entityId: (created._id as Types.ObjectId).toString(),
        changes: { after: { provider, label: body.label } },
        description: `${body.label} (${provider}) key added`,
      });

      return { message: 'Key saved', provider };
    }

    async getKeys(userId: string) {
      // Returns keys WITHOUT the actual encrypted value (for listing)
      return this.apiKeyModel.find(
        { userId: new Types.ObjectId(userId), isDeleted: { $ne: true } },
        { encryptedKey: 0 },
      );
    }

    // Batch existence check — used by the admin chatbot "needs setup" queue
    // to flag every bot whose owner is missing an OpenAI key in one query,
    // instead of an N+1 getKeys() call per bot in the list.
    async getUserIdsWithActiveKey(userIds: string[], provider: string): Promise<Set<string>> {
      if (!userIds.length) return new Set();
      const rows = await this.apiKeyModel
        .find(
          {
            userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
            provider,
            status: ApiKeyStatus.ACTIVE,
            isDeleted: { $ne: true },
          },
          { userId: 1 },
        )
        .lean();
      return new Set(rows.map((r) => r.userId.toString()));
    }

    async getDecryptedKey(userId: string, provider: string): Promise<string> {
      const record = await this.apiKeyModel
        .findOne({
          userId: new Types.ObjectId(userId),
          provider,
          status: ApiKeyStatus.ACTIVE,
          isDeleted: { $ne: true },
        })
        .select('+encryptedKey');

      if (!record) throw new NotFoundException(`No key found for provider: ${provider}`);

      await this.apiKeyModel.findByIdAndUpdate(record._id, {
        lastUsedAt: new Date(),
      });

      return this.decrypt(record.encryptedKey);
    }

    // A real delete now — isDeleted:true, hidden from every query above.
    // Previously this only ever flipped isActive:false (never actually
    // removed anything), which read as "Delete" in the UI but behaved
    // like "disable" — the new isDeleted field makes this correct.
    async deleteKey(userId: string, keyId: string, actor?: Actor) {
      const result = await this.apiKeyModel.findOneAndUpdate(
        { _id: new Types.ObjectId(keyId), userId: new Types.ObjectId(userId), isDeleted: { $ne: true } },
        { isDeleted: true },
      );
      if (!result) throw new NotFoundException('Key not found');
      await this.notificationsService.onApiKeyDeleted(userId, result.provider, result.label);

      await this.activityLogsService.record({
        userId, actorId: actor?.id || userId,
        actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
        action: ActivityAction.DELETE, entityType: 'apikey', entityId: keyId,
        changes: { before: { provider: result.provider, label: result.label } },
        description: `${result.label} (${result.provider}) key removed`,
      });

      return { message: 'Key deleted' };
    }

    async testKey(userId: string, provider: string) {
      const key = await this.getDecryptedKey(userId, provider);

      // Actually test connectivity per provider
      try {
        if (provider === ApiKeyProvider.OPENAI) {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!response.ok) throw new Error('Invalid OpenAI key');
          return { provider, status: 'valid', message: 'OpenAI key is valid' };
        }

        if (provider === ApiKeyProvider.ATLAS_SEEDANCE) {
          const response = await fetch('https://api.atlascloud.ai/api/v1/user/balance', {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!response.ok) throw new Error('Invalid Atlas key');
          const data = await response.json() as any;
          return {
            provider,
            status: 'valid',
            message: `Atlas key valid. Balance: $${data?.balance?.toFixed(2) || 'unknown'}`,
          };
        }

        if (provider === ApiKeyProvider.ANTHROPIC) {
          const response = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          });
          if (!response.ok) throw new Error('Invalid Anthropic key');
          return { provider, status: 'valid', message: 'Anthropic key is valid' };
        }

        if (provider === ApiKeyProvider.GEMINI) {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
          );
          if (!response.ok) throw new Error('Invalid Gemini key');
          return { provider, status: 'valid', message: 'Gemini key is valid' };
        }

        if (provider === ApiKeyProvider.YOUTUBE_DATA) {
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1&key=${key}`
          );
          if (!response.ok) throw new Error('Invalid YouTube Data API key');
          return { provider, status: 'valid', message: 'YouTube Data API key is valid' };
        }

        // For other providers — just confirm it decrypts
        return {
          provider,
          status: 'valid',
          message: `Key decrypted successfully — ${key.substring(0, 6)}...${key.substring(key.length - 4)}`,
        };
      } catch (err: any) {
        return {
          provider,
          status: 'invalid',
          message: err.message || 'Key test failed',
        };
      }
    }
  }
