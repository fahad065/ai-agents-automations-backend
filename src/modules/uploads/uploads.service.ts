import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageService } from '../storage/storage.service';
import { ChatbotsService } from '../chatbots/chatbots.service';
import { KnowledgeBase, KnowledgeBaseDocument } from '../chatbots/schemas/knowledge-base.schema';
import {
  IMAGE_TYPES,
  PDF_TYPES,
  SERVICE_MEDIA_TYPES,
  UploadCaller,
  UploadContext,
  UploadPurpose,
  requireAdmin,
  safeId,
} from './upload-purposes';

const MB = 1024 * 1024;

export function cleanFileName(name: unknown): string {
  return (String(name || 'file').split(/[\\/]/).pop() || 'file').replace(/[\u0000-\u001f<>"]/g, '').slice(0, 120) || 'file';
}

// The one place every upload goes through (POST /uploads).
@Injectable()
export class UploadsService implements OnModuleInit {
  private purposes: Record<string, UploadPurpose> = {};
  private chatbots!: ChatbotsService;

  constructor(
    private storage: StorageService,
    private moduleRef: ModuleRef,
    @InjectModel(KnowledgeBase.name) private knowledgeModel: Model<KnowledgeBaseDocument>,
  ) {}

  onModuleInit() {
    this.chatbots = this.moduleRef.get(ChatbotsService, { strict: false });
    this.purposes = {
      // Photos + a PDF brochure on a chatbot knowledge entry (public).
      'chatbot-knowledge': {
        bucket: 'public',
        types: { ...IMAGE_TYPES, ...PDF_TYPES },
        folder: async ({ caller, input }) => {
          const bot = await this.chatbots.findOne(safeId(input.chatbotId, 'chatbotId'), caller.userId, caller.isAdmin);
          return `chatbots/${(bot._id as Types.ObjectId).toString()}/knowledge/`;
        },
        beforeUpload: async ({ caller, input, contentType }) =>
          this.chatbots.assertMediaQuota(String(input.chatbotId), caller.userId, caller.isAdmin, contentType === 'application/pdf' ? 'pdf' : 'image'),
        inUse: async (key) => !!(await this.knowledgeModel.exists({ 'attachments.key': key })),
      },
      // Admin: overview/brochure PDF or image for a catalog service (public).
      'service-brochure': {
        bucket: 'public',
        types: { ...PDF_TYPES, ...IMAGE_TYPES },
        folder: async ({ caller, input }) => {
          requireAdmin(caller);
          return `services/${safeId(input.serviceId || 'general', 'serviceId')}/brochures/`;
        },
      },
      // Any media for a catalog service (admin): demo video, brochure,
      // audio, images, documents — under services/<slug>/<videos|audio|images|files>/.
      'service-media': {
        bucket: 'public',
        types: SERVICE_MEDIA_TYPES,
        folder: async ({ caller, input, contentType }) => {
          requireAdmin(caller);
          return `services/${safeId(input.serviceId || 'general', 'serviceId')}/${SERVICE_MEDIA_TYPES[contentType]?.folder || 'files'}/`;
        },
      },
      // A user's own documents (ID, trade licence…) — private.
      'user-document': {
        bucket: 'private',
        types: { ...PDF_TYPES, ...IMAGE_TYPES },
        folder: async ({ caller, input }) => {
          const owner = caller.isAdmin && input.userId ? safeId(input.userId, 'userId') : caller.userId;
          return `users/${owner}/documents/`;
        },
      },
    };
  }

  private purpose(name: unknown): UploadPurpose {
    const p = this.purposes[String(name)];
    if (!p) throw new BadRequestException('Unknown upload purpose');
    return p;
  }

  // Step 1 of every upload: check it, then return a signed URL the browser
  // PUTs the file to (10 minutes, bound to the exact type and size).
  async createUpload(caller: UploadCaller, body: any) {
    const purpose = this.purpose(body?.purpose);
    if (!this.storage.isConfigured(purpose.bucket)) {
      throw new BadRequestException('File uploads are not set up on this server yet.');
    }
    const contentType = String(body?.contentType || '').toLowerCase();
    const rule = purpose.types[contentType];
    if (!rule) {
      const exts = [...new Set(Object.values(purpose.types).map((t) => t.ext.toUpperCase()))].join(', ');
      throw new BadRequestException(`This file type isn't allowed here. Use ${exts}.`);
    }
    const size = Number(body?.size);
    if (!Number.isFinite(size) || size <= 0) throw new BadRequestException('The file is empty');
    if (size > rule.maxBytes) throw new BadRequestException(`This file is too large (max ${Math.round(rule.maxBytes / MB)} MB)`);

    const ctx: UploadContext = { caller, input: body || {}, contentType };
    const folder = await purpose.folder(ctx);
    if (purpose.beforeUpload) await purpose.beforeUpload(ctx);

    const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const key = `${folder}${rand}.${rule.ext}`;
    return {
      purpose: body.purpose,
      uploadUrl: await this.storage.presignUpload(purpose.bucket, key, contentType, size),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      key,
      bucket: purpose.bucket,
      url: purpose.bucket === 'public' ? this.storage.publicUrl(key) : null,
      name: cleanFileName(body?.name),
      contentType,
      size,
    };
  }

  // Removes a file that was uploaded but never saved on a record (form
  // cancelled, photo removed before saving). Files still in use are kept.
  async discard(caller: UploadCaller, body: any) {
    const purpose = this.purpose(body?.purpose);
    const ctx: UploadContext = { caller, input: body || {}, contentType: '' };
    const key = await this.ownedKey(purpose, ctx, body?.key);
    if (purpose.inUse && (await purpose.inUse(key, ctx))) return { message: 'File is in use' };
    await this.storage.deleteKeys(purpose.bucket, [key]);
    return { message: 'File removed' };
  }

  // A short-lived link to open a private file (public files have a URL).
  async fileUrl(caller: UploadCaller, query: any) {
    const purpose = this.purpose(query?.purpose);
    const ctx: UploadContext = { caller, input: query || {}, contentType: '' };
    const key = await this.ownedKey(purpose, ctx, query?.key);
    if (purpose.bucket === 'public') return { url: this.storage.publicUrl(key) };
    if (!(await this.storage.stat('private', key))) throw new NotFoundException('File not found');
    return { url: await this.storage.presignDownload(key, query?.name ? cleanFileName(query.name) : undefined) };
  }

  // For services that save an uploaded key on a record: confirms the file is
  // in that purpose's folder for this caller, exists, and is an allowed type.
  async verifyUploaded(caller: UploadCaller, purposeName: string, input: Record<string, any>, key: string) {
    const purpose = this.purpose(purposeName);
    const ctx: UploadContext = { caller, input, contentType: '' };
    const owned = await this.ownedKey(purpose, ctx, key);
    const stat = await this.storage.stat(purpose.bucket, owned);
    if (!stat) throw new BadRequestException('An uploaded file was not found — please upload it again');
    const contentType = (stat.contentType || '').toLowerCase();
    const rule = purpose.types[contentType];
    if (!rule || stat.size > rule.maxBytes) throw new BadRequestException('Unsupported file');
    return {
      key: owned,
      size: stat.size,
      contentType,
      url: purpose.bucket === 'public' ? this.storage.publicUrl(owned) : null,
    };
  }

  private async ownedKey(purpose: UploadPurpose, ctx: UploadContext, key: unknown): Promise<string> {
    const k = String(key || '');
    const folder = await purpose.folder(ctx);
    if (!k.startsWith(folder) || k.includes('..') || k.length > 300) throw new BadRequestException('Invalid file');
    return k;
  }
}
