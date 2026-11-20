import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { del } from '@vercel/blob';
import { StorageService } from '../storage/storage.service';
import { UploadsService } from '../uploads/uploads.service';
import { UploadedDocument, UploadedDocumentDocument } from './schemas/document.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

export interface Actor {
  id: string;
  role: 'user' | 'admin';
}


@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(UploadedDocument.name) private documentModel: Model<UploadedDocumentDocument>,
    private activityLogsService: ActivityLogsService,
    private storage: StorageService,
    private uploads: UploadsService,
  ) {}

  // Removes a stored file: R2 (private bucket) for current documents, Vercel
  // Blob for older ones. Never throws — a storage hiccup must not block the
  // database-side delete.
  private async removeFile(doc: { _id?: unknown; storageKey?: string; fileUrl?: string }) {
    if (doc.storageKey) return this.storage.deleteKeys('private', [doc.storageKey]);
    if (doc.fileUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(doc.fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (err: any) {
        this.logger.warn(`Failed to delete blob for document=${String(doc._id)}: ${err?.message}`);
      }
    }
  }

  // The browser has already uploaded the file to the private bucket through
  // POST /uploads (purpose 'user-document'); this records it after checking
  // the file is in that owner's folder, exists and is an allowed type.
  async createDocument(
    ownerId: string,
    documentType: string,
    upload: { key: string; name?: string },
    actor: Actor,
  ): Promise<UploadedDocumentDocument> {
    if (!documentType?.trim()) throw new BadRequestException('Document type is required');
    if (!upload?.key) throw new BadRequestException('A file is required');
    const file = await this.uploads.verifyUploaded(
      { userId: actor.id, isAdmin: actor.role === 'admin' },
      'user-document',
      { userId: ownerId },
      upload.key,
    );

    const created = await this.documentModel.create({
      userId: new Types.ObjectId(ownerId),
      documentType: documentType.trim(),
      storageKey: file.key,
      fileName: String(upload.name || '').split(/[\\/]/).pop()?.slice(0, 120) || undefined,
      fileType: file.contentType,
      fileSize: file.size,
      uploadedAt: new Date(),
    });
    const userId = ownerId;

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
      .select('-storageKey')
      .sort({ uploadedAt: -1 });
  }

  // A link to open one document: a 5-minute signed R2 link, or the old Blob
  // URL for documents uploaded before the move. Owner or admin only.
  async documentUrl(userId: string, docId: string, isAdmin = false): Promise<{ url: string }> {
    if (!Types.ObjectId.isValid(docId)) throw new NotFoundException('Document not found');
    const filter: any = { _id: new Types.ObjectId(docId), isDeleted: { $ne: true } };
    if (!isAdmin) filter.userId = new Types.ObjectId(userId);
    const doc = await this.documentModel.findOne(filter).lean();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.storageKey) return { url: await this.storage.presignDownload(doc.storageKey, doc.fileName) };
    if (doc.fileUrl) return { url: doc.fileUrl };
    throw new NotFoundException('File not found');
  }

  // Account deletion: hard-delete every document row for this user —
  // including ones already soft-deleted, since those rows still hold
  // identity-document metadata — and best-effort remove each stored file.
  // A failed file delete never blocks the account deletion (same rule as
  // deleteDocument() below).
  async purgeAllForUser(userId: string): Promise<number> {
    const uid = new Types.ObjectId(userId);
    const docs = await this.documentModel.find({ userId: uid }).select('fileUrl storageKey').lean();
    for (const doc of docs) await this.removeFile(doc);
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

    await this.removeFile(doc);

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
