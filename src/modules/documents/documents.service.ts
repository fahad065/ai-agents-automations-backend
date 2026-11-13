import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { put, del } from '@vercel/blob';
import { UploadedDocument, UploadedDocumentDocument } from './schemas/document.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

export interface Actor {
  id: string;
  role: 'user' | 'admin';
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(UploadedDocument.name) private documentModel: Model<UploadedDocumentDocument>,
    private activityLogsService: ActivityLogsService,
  ) {}

  private get blobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new BadRequestException(
        'Document uploads are not configured yet — BLOB_READ_WRITE_TOKEN is missing on this server.',
      );
    }
    return token;
  }

  async uploadDocument(
    userId: string,
    documentType: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
    actor?: Actor,
  ): Promise<UploadedDocumentDocument> {
    if (!documentType?.trim()) throw new BadRequestException('Document type is required');
    if (!file) throw new BadRequestException('A file is required');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File is too large — max 10MB');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type — only JPG, PNG, WEBP, or PDF are accepted');
    }

    const pathname = `documents/${userId}/${Date.now()}-${file.originalname}`;
    const blob = await put(pathname, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: this.blobToken,
    });

    const created = await this.documentModel.create({
      userId: new Types.ObjectId(userId),
      documentType: documentType.trim(),
      fileUrl: blob.url,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedAt: new Date(),
    });

    await this.activityLogsService.record({
      userId,
      actorId: actor?.id || userId,
      actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.CREATE,
      entityType: 'document',
      entityId: (created._id as Types.ObjectId).toString(),
      changes: { after: { documentType: created.documentType } },
      description: `Document "${created.documentType}" uploaded`,
    });

    return created;
  }

  async listDocuments(userId: string) {
    return this.documentModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: { $ne: true } })
      .sort({ uploadedAt: -1 });
  }

  // Account deletion: hard-delete every document row for this user —
  // including ones already soft-deleted, since those rows still hold
  // identity-document metadata — and best-effort remove each stored file.
  // A failed file delete never blocks the account deletion (same rule as
  // deleteDocument() below).
  async purgeAllForUser(userId: string): Promise<number> {
    const uid = new Types.ObjectId(userId);
    const docs = await this.documentModel.find({ userId: uid }).select('fileUrl').lean();
    for (const doc of docs) {
      try {
        await del(doc.fileUrl, { token: this.blobToken });
      } catch (err: any) {
        this.logger.warn(`Account deletion: failed to delete blob for document=${doc._id}: ${err?.message}`);
      }
    }
    const result = await this.documentModel.deleteMany({ userId: uid });
    return result.deletedCount ?? 0;
  }

  async hasAnyDocument(userId: string): Promise<boolean> {
    const count = await this.documentModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    });
    return count > 0;
  }

  async deleteDocument(userId: string, docId: string, isAdmin = false, actor?: Actor) {
    const filter: any = { _id: new Types.ObjectId(docId), isDeleted: { $ne: true } };
    if (!isAdmin) filter.userId = new Types.ObjectId(userId);

    const doc = await this.documentModel.findOne(filter);
    if (!doc) throw new NotFoundException('Document not found');

    try {
      await del(doc.fileUrl, { token: this.blobToken });
    } catch (err: any) {
      // Blob may already be gone, or BLOB_READ_WRITE_TOKEN missing in a
      // local/dev environment — never block the DB-side delete over a
      // storage-provider cleanup failure.
      this.logger.warn(`Failed to delete blob for document=${docId}: ${err?.message}`);
    }

    doc.isDeleted = true;
    await doc.save();

    await this.activityLogsService.record({
      userId: doc.userId.toString(),
      actorId: actor?.id || userId,
      actorRole: actor?.role === 'admin' ? ActorRole.ADMIN : ActorRole.USER,
      action: ActivityAction.DELETE,
      entityType: 'document',
      entityId: docId,
      changes: { before: { documentType: doc.documentType } },
      description: `Document "${doc.documentType}" removed`,
    });

    return { message: 'Document deleted' };
  }
}
