import {
    Injectable,
    NotFoundException,
    ConflictException,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import { ConfigService } from '@nestjs/config';
  import * as CryptoJS from 'crypto-js';
  import { ApiKey, ApiKeyDocument, ApiKeyProvider } from './schemas/api-key.schema';
import { NotificationsService } from '../notifications/notifications.service';
  
  @Injectable()
  export class ApiKeysService {
    constructor(
      @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
      private config: ConfigService,
      private notificationsService: NotificationsService,
    ) {}
  
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
      provider: ApiKeyProvider;
      label: string;
      key: string;
      agentId?: string;
      expiresAt?: Date;
    }) {
      const encrypted = this.encrypt(body.key);
  
      const existing = await this.apiKeyModel.findOne({
        userId: new Types.ObjectId(userId),
        provider: body.provider,
        agentId: body.agentId ? new Types.ObjectId(body.agentId) : undefined,
      });
  
      if (existing) {
        existing.encryptedKey = encrypted;
        existing.label = body.label;
        existing.isActive = true;
        await existing.save();
        return { message: 'Key updated', provider: body.provider };
      }
  
      await this.apiKeyModel.create({
        userId: new Types.ObjectId(userId),
        agentId: body.agentId ? new Types.ObjectId(body.agentId) : undefined,
        provider: body.provider,
        label: body.label,
        encryptedKey: encrypted,
        expiresAt: body.expiresAt,
      });

      await this.notificationsService.onApiKeyAdded(userId, body.provider, body.label);

      return { message: 'Key saved', provider: body.provider };
    }
  
    async getKeys(userId: string) {
      // Returns keys WITHOUT the actual encrypted value (for listing)
      return this.apiKeyModel.find(
        { userId: new Types.ObjectId(userId), isActive: true },
        { encryptedKey: 0 },
      );
    }
  
    async getDecryptedKey(userId: string, provider: ApiKeyProvider): Promise<string> {
      const record = await this.apiKeyModel
        .findOne({
          userId: new Types.ObjectId(userId),
          provider,
          isActive: true,
        })
        .select('+encryptedKey');
  
      if (!record) throw new NotFoundException(`No key found for provider: ${provider}`);
  
      await this.apiKeyModel.findByIdAndUpdate(record._id, {
        lastUsedAt: new Date(),
      });
  
      return this.decrypt(record.encryptedKey);
    }
  
    async deleteKey(userId: string, keyId: string) {
      const result = await this.apiKeyModel.findOneAndUpdate(
        { _id: new Types.ObjectId(keyId), userId: new Types.ObjectId(userId) },
        { isActive: false },
      );
      if (!result) throw new NotFoundException('Key not found');
      await this.notificationsService.onApiKeyDeleted(userId, result.provider, result.label);
      return { message: 'Key deactivated' };
    }
  
    async testKey(userId: string, provider: ApiKeyProvider) {
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