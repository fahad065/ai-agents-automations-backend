import { IMAGE_MAX_BYTES, PDF_MAX_BYTES } from '../uploads/upload-purposes';
// Photos and a PDF brochure on a knowledge-base entry (e.g. one property
// listing), uploaded through POST /uploads (purpose 'chatbot-knowledge')
// into the public R2 bucket under chatbots/<botId>/knowledge/.

export type MediaKind = 'image' | 'pdf';

export interface KnowledgeAttachment {
  kind: MediaKind;
  key: string;
  url: string;
  name: string;
  size: number;
  contentType: string;
}

export const MEDIA_TYPES: Record<MediaKind, { types: Record<string, string>; maxBytes: number; perEntry: number }> = {
  image: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/bmp': 'bmp' }, maxBytes: IMAGE_MAX_BYTES, perEntry: 5 },
  pdf: { types: { 'application/pdf': 'pdf' }, maxBytes: PDF_MAX_BYTES, perEntry: 1 },
};

// Per chatbot, across all its knowledge entries.
export const PLAN_MEDIA_LIMITS: Record<string, Record<MediaKind, number>> = {
  basic: { image: 100, pdf: 20 },
  pro: { image: 500, pdf: 100 },
  custom: { image: 500, pdf: 100 },
};

export const planMediaLimits = (tier?: string) => PLAN_MEDIA_LIMITS[tier || 'basic'] || PLAN_MEDIA_LIMITS.basic;

// Where a bot's knowledge photos/PDFs live in the public bucket (the
// 'chatbot-knowledge' upload purpose writes there).
export const mediaFolder = (chatbotId: string) => `chatbots/${chatbotId}/knowledge/`;

// A safe display name for a file (no paths, no control characters).
export function cleanFileName(name: string): string {
  return (String(name || 'file').split(/[\\/]/).pop() || 'file').replace(/[\u0000-\u001f<>"]/g, '').slice(0, 120) || 'file';
}
