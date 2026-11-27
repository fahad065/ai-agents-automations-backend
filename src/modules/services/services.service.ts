import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Service, ServiceDocument, ServiceStatus } from './schemas/service.schema';
import { StorageService } from '../storage/storage.service';
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
    private readonly storage: StorageService,
  ) {}

  // Media fields that may point at a file uploaded to our public bucket.
  private static readonly MEDIA_FIELDS = ['demoVideoUrl', 'brochureUrl'] as const;

  // The R2 key behind one of our own uploaded service files, else null
  // (YouTube links, other sites, files outside services/).
  private ownedMediaKey(url: unknown): string | null {
    const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    if (!base || typeof url !== 'string' || !url.startsWith(base + '/')) return null;
    const key = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]);
    return key.startsWith('services/') && !key.includes('..') ? key : null;
  }

  // Fills the catalog on a brand-new (empty) database only — a local or test
  // database. Once the collection has any document, nothing runs: the
  // catalog is edited by hand in Service Catalog, and a service deleted
  // there never comes back.
  async onModuleInit() {
    if (await this.serviceModel.estimatedDocumentCount()) return;
    await this.serviceModel.insertMany(LEGACY_SEED_MODULES.map((m) => compact(legacyModuleToService(m))));
    this.logger.log(`Empty database: seeded ${LEGACY_SEED_MODULES.length} services`);
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
    if (pipelineCategory) filter['pipeline.pipelineCategory'] = pipelineCategory;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { 'content.description': { $regex: search, $options: 'i' } },
      { 'content.tagline': { $regex: search, $options: 'i' } },
    ];

    const [data, total] = await Promise.all([
      this.serviceModel.find(filter)
        .sort({ 'display.sortOrder': 1, createdAt: -1 })
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
    // No sort order given (or 0): the next free number for this type —
    // 7 chatbots numbered 1–7 means a new chatbot gets 8.
    const display = (data as any).display ?? {};
    if (!(display.sortOrder > 0) && data.type) {
      const last = await this.serviceModel
        .findOne({ type: data.type, isDeleted: false })
        .sort({ 'display.sortOrder': -1 })
        .select('display.sortOrder')
        .lean();
      (data as any).display = { ...display, sortOrder: ((last as any)?.display?.sortOrder ?? 0) + 1 };
    }
    // strict 'throw': an unknown field is a 400, never silently dropped
    // (see update()).
    return new this.serviceModel(data, null, { strict: 'throw' }).save().catch(rejectUnknownField);
  }

  async update(idOrSlug: string, data: Record<string, any>): Promise<ServiceDocument> {
    const { _id, createdAt, updatedAt, ...rest } = data;
    const before = await this.serviceModel.findOne({ ...this.keyFilter(idOrSlug), isDeleted: false }).select('content').lean();
    const service = await this.serviceModel.findOneAndUpdate(
      { ...this.keyFilter(idOrSlug), isDeleted: false },
      rest,
      // An unknown field (e.g. the old flat `description` sent by a page
      // loaded before the 2026-11-16 regroup) used to be silently stripped
      // while the save returned 200 — content looked saved but wasn't.
      // Now it's a 400, so the admin sees "Failed to save" instead.
      { new: true, strict: 'throw', runValidators: true },
    ).catch(rejectUnknownField);
    if (!service) throw new NotFoundException('Service not found');
    // A replaced or cleared demo video / brochure: delete the old uploaded file.
    const old = ServicesService.MEDIA_FIELDS
      .filter((f) => (before as any)?.content?.[f] !== (service as any).content?.[f])
      .map((f) => this.ownedMediaKey((before as any)?.content?.[f]))
      .filter((k): k is string => !!k);
    if (old.length) await this.storage.deleteKeys('public', old);
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
    const c = doc.content || {};
    return {
      ...doc,
      name: doc.name_ar || doc.name,
      content: {
        ...c,
        tagline: c.tagline_ar || c.tagline,
        description: c.description_ar || c.description,
        capabilities: c.capabilities_ar?.length ? c.capabilities_ar : c.capabilities,
      },
      pricing: doc.pricing && {
        ...doc.pricing,
        features: doc.pricing.features_ar?.length ? doc.pricing.features_ar : doc.pricing.features,
      },
    };
  }
}

// Mongoose's StrictModeError would otherwise surface as a 500.
function rejectUnknownField(err: any): never {
  if (err?.name === 'StrictModeError' || err?.name === 'ValidationError') {
    throw new BadRequestException(
      err.name === 'StrictModeError'
        ? `Unknown field "${err.path}". Reload the page and save again.`
        : err.message,
    );
  }
  throw err;
}
