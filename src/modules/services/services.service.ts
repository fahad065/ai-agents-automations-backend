import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Service, ServiceDocument, ServiceStatus } from './schemas/service.schema';
import { legacyModuleToService } from './legacy-module.mapper';
import { LEGACY_SEED_MODULES } from './seed-services';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Mongo stores an explicit `undefined` as null; drop them so optional
// fields stay genuinely absent.
function compact<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async onModuleInit() {
    await this.migrateFromModules();
    await this.seed();
  }

  // One-time data move from the old `modules` collection. Runs on every boot
  // but only ever inserts: keyed on _id, so once a service exists it's never
  // touched again (admin edits made in `services` are safe). Each service
  // KEEPS its old module's _id — that's what lets every existing reference
  // (usermodules.moduleId, industries.defaultModuleIds,
  // industry-subscriptions) keep resolving with no data rewrite. Becomes a
  // no-op once `modules` is dropped by hand after verification.
  private async migrateFromModules() {
    const legacy = await this.connection.db!.collection('modules').find({}).toArray();
    if (!legacy.length) return;

    let migrated = 0;
    for (const doc of legacy) {
      try {
        const result = await this.serviceModel.updateOne(
          { _id: doc._id },
          { $setOnInsert: compact({ _id: doc._id, ...legacyModuleToService(doc) }) },
          { upsert: true },
        );
        if (result.upsertedCount) migrated++;
      } catch (err: any) {
        // Duplicate slug under a different _id — a services doc with this
        // slug already exists (e.g. created by hand). Leave both alone and
        // say so rather than guessing which one is right.
        this.logger.warn(`Skipped migrating module "${doc.slug}" (${doc._id}): ${err?.message}`);
      }
    }
    if (migrated) this.logger.log(`Migrated ${migrated} module(s) -> services`);
  }

  // Same insert-only, upsert-by-slug seeding the old ModulesService did —
  // fills in any catalog entry missing on a fresh database, never overwrites.
  private async seed() {
    let seeded = 0;
    for (const m of LEGACY_SEED_MODULES) {
      const result = await this.serviceModel.updateOne(
        { slug: m.slug },
        { $setOnInsert: compact(legacyModuleToService(m)) },
        { upsert: true },
      );
      if (result.upsertedCount) seeded++;
    }
    if (seeded) this.logger.log(`Services seeded: ${seeded} new / ${LEGACY_SEED_MODULES.length} total`);
  }

  // ── Read ──────────────────────────────────────────────────

  async findAll(options: {
    type?: string;
    category?: string;
    publicOnly?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    country?: string;
    nicheSlug?: string;
    pipelineCategory?: string;
    lang?: string;
  } = {}) {
    const {
      type, category, publicOnly, search,
      page = 1, limit = 20, country, nicheSlug, pipelineCategory, lang = 'en',
    } = options;

    const filter: any = { isDeleted: false };
    if (type) filter.type = type;
    if (category) filter.category = category;
    // Public catalog = active + coming soon (coming-soon cards render with an
    // overlay on /pricing); inactive is admin-only.
    if (publicOnly) filter.status = { $in: [ServiceStatus.ACTIVE, ServiceStatus.COMING_SOON] };
    if (country) filter.availableIn = country;
    if (nicheSlug) filter.nicheSlug = nicheSlug;
    if (pipelineCategory) filter.pipelineCategory = pipelineCategory;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tagline: { $regex: search, $options: 'i' } },
    ];

    const [data, total] = await Promise.all([
      this.serviceModel.find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.serviceModel.countDocuments(filter),
    ]);

    const localized = lang === 'ar' ? data.map((d) => this.localize(d)) : data;
    return { data: localized, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(idOrSlug: string): Promise<ServiceDocument> {
    const service = await this.serviceModel.findOne({ ...this.keyFilter(idOrSlug), isDeleted: false }).lean();
    if (!service) throw new NotFoundException('Service not found');
    return service as any;
  }

  // ── Admin CRUD ────────────────────────────────────────────

  async create(data: Partial<Service>): Promise<ServiceDocument> {
    if (data.slug && await this.serviceModel.exists({ slug: data.slug })) {
      throw new BadRequestException(`Slug "${data.slug}" already exists`);
    }
    return this.serviceModel.create(data);
  }

  async update(idOrSlug: string, data: Record<string, any>): Promise<ServiceDocument> {
    const { _id, createdAt, updatedAt, ...rest } = data;
    const service = await this.serviceModel.findOneAndUpdate(
      { ...this.keyFilter(idOrSlug), isDeleted: false },
      rest,
      { new: true },
    );
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async softDelete(idOrSlug: string): Promise<void> {
    await this.serviceModel.findOneAndUpdate(
      this.keyFilter(idOrSlug),
      { isDeleted: true, status: ServiceStatus.INACTIVE },
    );
  }

  private keyFilter(idOrSlug: string) {
    return OBJECT_ID.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  }

  // Only reached when a caller passes ?lang=ar (apiClient on the frontend
  // always appends it). The old ModulesService version set a literal
  // 'pricing.features' top-level key instead of the nested field — fixed.
  private localize(doc: any): any {
    return {
      ...doc,
      name: doc.name_ar || doc.name,
      tagline: doc.tagline_ar || doc.tagline,
      description: doc.description_ar || doc.description,
      capabilities: doc.capabilities_ar?.length ? doc.capabilities_ar : doc.capabilities,
      pricing: doc.pricing && {
        ...doc.pricing,
        features: doc.pricing.features_ar?.length ? doc.pricing.features_ar : doc.pricing.features,
      },
    };
  }
}
