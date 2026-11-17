import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { TEMPLATE_TO_SERVICE_SLUG } from './chatbot-view';

// One-time move of `chatbots` into `userservices` (type 'chatbot'),
// agreed field by field with the owner on 2026-11-17 (ai/traces.md):
//   - same _id, so knowledge entries, conversations, billing records and
//     dashboard links keep pointing at the right bot;
//   - settings → config.*, bot status → config.botStatus;
//   - billing → status / plan{tier,monthlyFee,setupFee,currency} /
//     trialEndDate / nextRenewalDate / adminNotes / trialReminderSentAt;
//     'awaiting_setup_payment' → 'past_due';
//   - template → serviceId (the matching catalog service).
// Then knowledgebases / conversations / billings: chatbotId → userserviceId.
//
// Idempotent: bots already in userservices are skipped, and child rows are
// only touched while they still have chatbotId. Never deletes `chatbots` —
// the owner drops that collection by hand once production is verified.
@Injectable()
export class UserServicesMigration implements OnModuleInit {
  private readonly logger = new Logger(UserServicesMigration.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    await this.migrateChatbots();
    await this.relinkChildren();
  }

  private async migrateChatbots() {
    const db = this.connection.db!;
    const exists = await db.listCollections({ name: 'chatbots' }, { nameOnly: true }).hasNext();
    if (!exists) return;

    const target = db.collection('userservices');
    const bots = await db.collection('chatbots').find({}).toArray();
    if (!bots.length) return;

    const already = new Set(
      (await target.find({ _id: { $in: bots.map((b) => b._id) } }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)),
    );
    const pending = bots.filter((b) => !already.has(String(b._id)));
    if (!pending.length) return;

    const slugs = Object.values(TEMPLATE_TO_SERVICE_SLUG);
    const services = await db.collection('services').find({ slug: { $in: slugs } }, { projection: { slug: 1 } }).toArray();
    const serviceIdBySlug = new Map(services.map((s) => [s.slug, s._id]));

    const docs = pending.map((b: any) => toUserServiceRow(b, serviceIdBySlug));
    const withoutService = docs.filter((d) => !d.serviceId).map((d) => `${d._id} (${d.name})`);

    try {
      await target.insertMany(docs, { ordered: false });
    } catch (err: any) {
      // Another replica may have inserted some rows at the same moment.
      if (err?.code !== 11000 && !err?.writeErrors?.every((e: any) => e.code === 11000)) throw err;
    }
    this.logger.log(`Moved ${docs.length} chatbot(s) into userservices`);
    if (withoutService.length) {
      this.logger.warn(`Chatbots with no matching catalog service (template custom/unknown): ${withoutService.join(', ')}`);
    }
  }

  private async relinkChildren() {
    const db = this.connection.db!;
    for (const name of ['knowledgebases', 'conversations', 'billings']) {
      const col = db.collection(name);
      const res = await col.updateMany(
        { chatbotId: { $exists: true } },
        [{ $set: { userserviceId: '$chatbotId' } }, { $unset: 'chatbotId' }],
      );
      if (res.modifiedCount) this.logger.log(`${name}: chatbotId → userserviceId on ${res.modifiedCount} row(s)`);
      for (const index of ['chatbotId_1', 'chatbotId_1_sessionId_1', 'chatbotId_1_createdAt_-1']) {
        await col.dropIndex(index).catch(() => undefined);
      }
    }
  }
}

const STATUS_MAP: Record<string, string> = {
  trial: 'trial',
  active: 'active',
  past_due: 'past_due',
  suspended: 'suspended',
  awaiting_setup_payment: 'past_due',
};

function compact<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function toUserServiceRow(b: any, serviceIdBySlug: Map<string, any>) {
  const billing = b.billing || {};
  const slug = b.template ? TEMPLATE_TO_SERVICE_SLUG[b.template] : undefined;
  return compact({
    _id: b._id,
    userId: b.userId,
    type: 'chatbot',
    serviceId: slug ? serviceIdBySlug.get(slug) : undefined,
    name: b.name,
    status: STATUS_MAP[billing.status] || 'trial',
    isFreeForever: false,
    isDeleted: false,
    subscriptionStartDate: b.createdAt || new Date(),
    trialEndDate: billing.trialEndsAt,
    nextRenewalDate: billing.nextBillingDate,
    plan: {
      tier: billing.tier || 'basic',
      monthlyFee: billing.monthlyFee || 0,
      setupFee: billing.setupFee || 0,
      currency: billing.currency || 'USD',
    },
    adminNotes: billing.notes,
    trialReminderSentAt: billing.trialReminderSent ? b.updatedAt || new Date() : undefined,
    config: compact({
      botStatus: b.status || 'draft',
      description: b.description,
      persona: b.persona,
      bookingUrl: b.bookingUrl,
      language: b.language || 'both',
      fallbackMessage: b.fallbackMessage,
      fallbackMessage_ar: b.fallbackMessage_ar,
      humanHandoff: !!b.humanHandoff,
      embedKey: b.embedKey,
      channels: b.channels || {},
      outlets: b.outlets || [],
      chatModelConfig: b.chatModelConfig,
      embeddingModelConfig: b.embeddingModelConfig,
    }),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  });
}
