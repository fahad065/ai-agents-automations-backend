import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as Sentry from '@sentry/nestjs';
import { BucketKind, StorageService } from '../storage/storage.service';
import { KnowledgeBase, KnowledgeBaseDocument } from '../chatbots/schemas/knowledge-base.schema';
import { Service, ServiceDocument } from '../services/schemas/service.schema';
import { UploadedDocument, UploadedDocumentDocument } from '../documents/schemas/document.schema';

// Daily clean-up of stray uploads (owner request, 2026-11-23).
//
// A browser uploads a file straight to R2 *before* the record that uses it is
// saved (a knowledge entry, a service, a profile document). If the record is
// never saved — the tab is closed, the form cancelled — the file stays in the
// bucket, unused and not counted against any plan limit. Once a day this
// deletes every such file older than 24 hours.
//
// Only files are deleted, never database rows. Invoices are never touched.
// Safety: if a folder would lose more than a quarter of its files (and more
// than 10), nothing is deleted there and the case is reported — that points to
// a bug or a misconfiguration, not stray uploads.
const AREAS: { kind: BucketKind; prefix: string; label: string }[] = [
  { kind: 'public', prefix: 'chatbots/', label: 'chatbot knowledge files' },
  { kind: 'public', prefix: 'services/', label: 'service media' },
  { kind: 'private', prefix: 'users/', label: 'user documents' },
];
export const STRAY_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly storage: StorageService,
    @InjectModel(KnowledgeBase.name) private readonly knowledgeModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Service.name) private readonly serviceModel: Model<ServiceDocument>,
    @InjectModel(UploadedDocument.name) private readonly documentModel: Model<UploadedDocumentDocument>,
  ) {}

  // 04:00 UTC — after the account-deletion cron (03:00), before the 09:00/10:00 ones.
  @Cron('0 4 * * *')
  async run() {
    try {
      const result = await this.cleanUp();
      const total = Object.values(result).reduce((n, r) => n + r.deleted, 0);
      if (total) this.logger.log(`Deleted ${total} stray upload(s): ${JSON.stringify(result)}`);
    } catch (err: any) {
      this.logger.error(`Stray-upload clean-up failed: ${err?.message || err}`);
      Sentry.captureException(err);
    }
  }

  // Keys every saved record still uses, per area. Throws if the database
  // can't be read — then nothing is deleted.
  private async usedKeys(): Promise<Record<string, Set<string>>> {
    const [entries, services, docs] = await Promise.all([
      this.knowledgeModel.find({ 'attachments.0': { $exists: true } }).select('attachments.key').lean(),
      this.serviceModel.find({}).select('content.demoVideoUrl content.brochureUrl').lean(),
      this.documentModel.find({ storageKey: { $exists: true } }).select('storageKey').lean(),
    ]);
    const chatbots = new Set<string>();
    for (const e of entries as any[]) for (const a of e.attachments || []) if (a?.key) chatbots.add(a.key);
    // Services store full public URLs; match on the path from "services/" so a
    // change of media domain never makes a used file look unused.
    const servicesUsed = new Set<string>();
    for (const s of services as any[]) {
      for (const url of [s.content?.demoVideoUrl, s.content?.brochureUrl]) {
        const i = typeof url === 'string' ? url.indexOf('/services/') : -1;
        if (i >= 0) servicesUsed.add(decodeURIComponent(url.slice(i + 1).split(/[?#]/)[0]));
      }
    }
    const users = new Set<string>((docs as any[]).map((d) => d.storageKey).filter(Boolean));
    return { 'chatbots/': chatbots, 'services/': servicesUsed, 'users/': users };
  }

  async cleanUp(now = Date.now()) {
    const result: Record<string, { checked: number; deleted: number; skipped?: string }> = {};
    const used = await this.usedKeys();
    for (const area of AREAS) {
      if (!this.storage.isConfigured(area.kind)) continue;
      const objects = await this.storage.listObjects(area.kind, area.prefix);
      const stray = objects
        .filter((o) => now - o.lastModified.getTime() > STRAY_AGE_MS && !used[area.prefix].has(o.key))
        .map((o) => o.key);
      if (stray.length > 10 && stray.length > objects.length / 4) {
        const msg = `Not cleaning ${area.label}: ${stray.length} of ${objects.length} files look unused, which is too many to be stray uploads.`;
        this.logger.warn(msg);
        Sentry.captureMessage(msg, 'warning');
        result[area.prefix] = { checked: objects.length, deleted: 0, skipped: msg };
        continue;
      }
      await this.storage.deleteKeys(area.kind, stray);
      result[area.prefix] = { checked: objects.length, deleted: stray.length };
    }
    return result;
  }
}
