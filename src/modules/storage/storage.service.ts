import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// File storage on Cloudflare R2 (S3-compatible). Two buckets per environment:
//   public  — files anyone may see (knowledge photos, brochures, demo videos),
//             served from R2_PUBLIC_URL (e.g. https://media.logicmate.io)
//   private — files only their owner/admin may see (user documents,
//             invoices), opened through short-lived signed links
// Settings (per environment, never committed):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_PUBLIC_BUCKET, R2_PUBLIC_URL, R2_PRIVATE_BUCKET,
//   R2_ENDPOINT — optional, only to point at another S3-compatible server
//                 (the e2e harness uses a local fake).
// Browser uploads go straight to R2 through a signed URL (see UploadsService);
// files never pass through this server. putObject() is for files the server
// creates itself (e.g. invoice PDFs).
export type BucketKind = 'public' | 'private';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  private bucketName(kind: BucketKind): string | undefined {
    return kind === 'public' ? process.env.R2_PUBLIC_BUCKET : process.env.R2_PRIVATE_BUCKET;
  }

  isConfigured(kind: BucketKind = 'public'): boolean {
    const base = !!(
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
      this.bucketName(kind)
    );
    return kind === 'public' ? base && !!process.env.R2_PUBLIC_URL : base;
  }

  private s3(kind: BucketKind): S3Client {
    if (!this.isConfigured(kind)) throw new ServiceUnavailableException('File uploads are not set up on this server yet.');
    if (!this.client) {
      const custom = process.env.R2_ENDPOINT;
      this.client = new S3Client({
        region: 'auto',
        endpoint: custom || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        forcePathStyle: !!custom,
        // Cloudflare's recommended settings for R2: only add checksums where
        // S3 requires them (newer SDKs add them by default, which R2 and
        // signed browser uploads don't expect).
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  publicUrl(key: string): string {
    return `${(process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')}/${key}`;
  }

  // A signed PUT URL valid for 10 minutes. The content type and exact size
  // are part of the signature, so the browser can't upload anything else.
  async presignUpload(kind: BucketKind, key: string, contentType: string, size: number): Promise<string> {
    return getSignedUrl(
      this.s3(kind),
      new PutObjectCommand({ Bucket: this.bucketName(kind), Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: 600 },
    );
  }

  // A signed link to open a private file, valid for 5 minutes.
  async presignDownload(key: string, fileName?: string): Promise<string> {
    return getSignedUrl(
      this.s3('private'),
      new GetObjectCommand({
        Bucket: this.bucketName('private'),
        Key: key,
        ...(fileName ? { ResponseContentDisposition: `inline; filename="${fileName.replace(/["\\\r\n]/g, '')}"` } : {}),
      }),
      { expiresIn: 300 },
    );
  }

  // Server-side upload of a file the backend generated itself.
  async putObject(kind: BucketKind, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3(kind).send(new PutObjectCommand({ Bucket: this.bucketName(kind), Key: key, Body: body, ContentType: contentType }));
  }

  // Reads a whole object (small files the server serves itself, e.g. invoices).
  async getObject(kind: BucketKind, key: string): Promise<Buffer | null> {
    try {
      const out = await this.s3(kind).send(new GetObjectCommand({ Bucket: this.bucketName(kind), Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  // Size + type of an uploaded object, or null if it isn't there.
  async stat(kind: BucketKind, key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const out = await this.s3(kind).send(new HeadObjectCommand({ Bucket: this.bucketName(kind), Key: key }));
      return { size: Number(out.ContentLength || 0), contentType: out.ContentType };
    } catch {
      return null;
    }
  }

  // Best-effort delete; a storage hiccup never fails the caller.
  async deleteKeys(kind: BucketKind, keys: string[]): Promise<void> {
    if (!keys.length || !this.isConfigured(kind)) return;
    try {
      for (let i = 0; i < keys.length; i += 1000) {
        await this.s3(kind).send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName(kind),
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    } catch (err: any) {
      this.logger.warn(`Deleting ${keys.length} file(s) failed: ${err?.message || err}`);
    }
  }

  async deletePrefix(kind: BucketKind, prefix: string): Promise<void> {
    if (!this.isConfigured(kind)) return;
    try {
      let token: string | undefined;
      do {
        const page = await this.s3(kind).send(
          new ListObjectsV2Command({ Bucket: this.bucketName(kind), Prefix: prefix, ContinuationToken: token }),
        );
        await this.deleteKeys(kind, (page.Contents || []).map((o) => o.Key!).filter(Boolean));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (err: any) {
      this.logger.warn(`Deleting files under ${prefix} failed: ${err?.message || err}`);
    }
  }
}
