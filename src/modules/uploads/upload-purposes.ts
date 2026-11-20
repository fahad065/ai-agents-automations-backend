import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BucketKind } from '../storage/storage.service';

// Every kind of upload on the platform is a "purpose". The browser names the
// purpose (plus details such as the chatbot id); the purpose decides the
// bucket, folder, allowed file types and sizes, and who may upload. Callers
// never choose a folder themselves. To add a new upload anywhere in the
// product: add a purpose here and call POST /uploads from the page.

export interface UploadCaller {
  userId: string;
  isAdmin: boolean;
}

export interface UploadContext {
  caller: UploadCaller;
  /** Purpose-specific details sent with the request (e.g. chatbotId). */
  input: Record<string, any>;
  contentType: string;
}

export interface UploadPurpose {
  bucket: BucketKind;
  /** Allowed MIME type → { file extension, max size in bytes }. */
  types: Record<string, { ext: string; maxBytes: number }>;
  /** Checks access and returns the folder (ends with "/"). Throws if not allowed. */
  folder(ctx: UploadContext): Promise<string>;
  /** Extra checks before an upload is signed (e.g. plan limits). */
  beforeUpload?(ctx: UploadContext): Promise<void>;
  /** Whether a saved record still uses this file (then it isn't deleted on discard). */
  inUse?(key: string, ctx: UploadContext): Promise<boolean>;
}

// Owner decision (2026-11-20): photos up to 10 MB, PDFs up to 100 MB
// (real estate brochures carry many high-resolution photos). No video
// uploads — videos are linked (YouTube, virtual tours), not hosted.
const MB = 1024 * 1024;
export const IMAGE_MAX_BYTES = 10 * MB;
export const PDF_MAX_BYTES = 100 * MB;
export const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', maxBytes: IMAGE_MAX_BYTES },
  'image/png': { ext: 'png', maxBytes: IMAGE_MAX_BYTES },
  'image/webp': { ext: 'webp', maxBytes: IMAGE_MAX_BYTES },
};
export const PDF_TYPES = { 'application/pdf': { ext: 'pdf', maxBytes: PDF_MAX_BYTES } };

export function requireAdmin(caller: UploadCaller) {
  if (!caller.isAdmin) throw new ForbiddenException('Only admins can upload this');
}

// Ids used in folder names: Mongo ids or simple slugs only.
export function safeId(value: unknown, what: string): string {
  const v = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(v)) throw new BadRequestException(`Missing or invalid ${what}`);
  return v;
}
