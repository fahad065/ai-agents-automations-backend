import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Named UploadedDocument (not "Document") to avoid colliding with
// Mongoose's own `Document` type, which every schema file in this
// codebase imports. Collection name pinned explicitly to `documents` to
// match the new UML entity name regardless of the TS class name.
export type UploadedDocumentDocument = UploadedDocument & Document;

@Schema({ timestamps: true, collection: 'documents' })
export class UploadedDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Open-ended, not enum-constrained — same reasoning as apikeys.provider:
  // document types are genuinely country-specific (Emirates ID, KRA PIN,
  // etc.) and the user must be able to type one that isn't in the preset
  // list. DocumentsService.uploadDocument() only trims it, no slugifying
  // — this is a human-readable label shown back to the user/admin as-is,
  // not a lookup key the way apikeys.provider is.
  @Prop({ required: true, trim: true })
  documentType: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  fileType?: string;

  @Prop()
  fileSize?: number;

  @Prop({ default: () => new Date() })
  uploadedAt: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const UploadedDocumentSchema = SchemaFactory.createForClass(UploadedDocument);
UploadedDocumentSchema.index({ userId: 1, isDeleted: 1 });
