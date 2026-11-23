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

// Owner decision (2026-11-23): the admin may upload any media for a catalog
// service (demo / "how it works" video, brochure, audio, images, documents).
// Allow-listed by type so nothing that runs in a browser (HTML, SVG, JS) is
// ever served from the public media domain.
const SERVICE_IMAGE_MAX = 25 * MB;
const SERVICE_DOC_MAX = 200 * MB;
const SERVICE_AUDIO_MAX = 500 * MB;
const SERVICE_VIDEO_MAX = 2048 * MB;
export const SERVICE_MEDIA_TYPES: Record<string, { ext: string; maxBytes: number; folder: string }> = {
  'image/jpeg': { ext: 'jpg', maxBytes: SERVICE_IMAGE_MAX, folder: 'images' },
  'image/png': { ext: 'png', maxBytes: SERVICE_IMAGE_MAX, folder: 'images' },
  'image/webp': { ext: 'webp', maxBytes: SERVICE_IMAGE_MAX, folder: 'images' },
  'image/gif': { ext: 'gif', maxBytes: SERVICE_IMAGE_MAX, folder: 'images' },
  'image/avif': { ext: 'avif', maxBytes: SERVICE_IMAGE_MAX, folder: 'images' },
  'application/pdf': { ext: 'pdf', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/msword': { ext: 'doc', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/vnd.ms-excel': { ext: 'xls', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'text/csv': { ext: 'csv', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'text/plain': { ext: 'txt', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'application/zip': { ext: 'zip', maxBytes: SERVICE_DOC_MAX, folder: 'files' },
  'audio/mpeg': { ext: 'mp3', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/mp4': { ext: 'm4a', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/x-m4a': { ext: 'm4a', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/aac': { ext: 'aac', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/wav': { ext: 'wav', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/x-wav': { ext: 'wav', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/ogg': { ext: 'ogg', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/webm': { ext: 'weba', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'audio/flac': { ext: 'flac', maxBytes: SERVICE_AUDIO_MAX, folder: 'audio' },
  'video/mp4': { ext: 'mp4', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/webm': { ext: 'webm', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/quicktime': { ext: 'mov', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/ogg': { ext: 'ogv', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/x-m4v': { ext: 'm4v', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/x-matroska': { ext: 'mkv', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
  'video/x-msvideo': { ext: 'avi', maxBytes: SERVICE_VIDEO_MAX, folder: 'videos' },
};

export function requireAdmin(caller: UploadCaller) {
  if (!caller.isAdmin) throw new ForbiddenException('Only admins can upload this');
}

// Ids used in folder names: Mongo ids or simple slugs only.
export function safeId(value: unknown, what: string): string {
  const v = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(v)) throw new BadRequestException(`Missing or invalid ${what}`);
  return v;
}
