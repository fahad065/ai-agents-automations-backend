import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  ) {}

  async onModuleInit() {
    await this.seed();
    await this.dropRetiredFields();
  }

  // The first services release carried category/availableIn/
  // estimatedCostPerRun over from `modules`; they were then removed to match
  // architecture.md. Goes through the raw collection because Mongoose strict
  // mode silently drops $unset of paths that aren't on the schema anymore.
  // Matches nothing once cleaned, so it's free on every later boot.
  private async dropRetiredFields() {
    const retired = ['category', 'availableIn', 'estimatedCostPerRun'];
    const result = await this.serviceModel.collection.updateMany(
      { $or: retired.map((f) => ({ [f]: { $exists: true } })) },
      { $unset: Object.fromEntries(retired.map((f) => [f, ''])) },
    );
    if (result.modifiedCount) this.logger.log(`Removed retired fields from ${result.modifiedCount} service(s)`);
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
    publicOnly?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    nicheSlug?: string;
    pipelineCategory?: string;
    lang?: string;
  } = {}) {
    const {
      type, publicOnly, search,
      page = 1, limit = 20, nicheSlug, pipelineCategory, lang = 'en',
    } = options;

    const filter: any = { isDeleted: false };
    if (type) filter.type = type;
    // Public catalog = active + coming soon (coming-soon cards render with an
    // overlay on /pricing); inactive is admin-only.
    if (publicOnly) filter.status = { $in: [ServiceStatus.ACTIVE, ServiceStatus.COMING_SOON] };
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
