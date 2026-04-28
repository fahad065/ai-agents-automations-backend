import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ModuleTemplate, ModuleDocument } from './schemas/module.schema';

@Injectable()
export class ModulesService {
  constructor(
    @InjectModel(ModuleTemplate.name)
    private moduleModel: Model<ModuleDocument>,
  ) {}

  // ── Public — list all active modules ─────────────────────

  async findAll(options: {
    moduleType?: string;
    category?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  } = {}) {
    const { moduleType, category, isActive, search, page = 1, limit = 20, includeDeleted = false } = options;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (!includeDeleted) filter.isDeleted = false;
    if (moduleType) filter.moduleType = moduleType;
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tagline: { $regex: search, $options: 'i' } },
    ];

    const [data, total] = await Promise.all([
      this.moduleModel.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.moduleModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPublicStats() {
    const modules = await this.moduleModel.aggregate([
        { $match: { isDeleted: false, isActive: true } },
        {
          $group: {
            _id: null,
            totalModules: { $sum: 1 },
            totalUsersCount: { $sum: '$totalUsersCount' },
            totalRunsCount: { $sum: '$totalRunsCount' },
          }
        }
    ]);
 
    const stats = modules[0] || { totalModules: 0, totalUsersCount: 0, totalRunsCount: 0 };
 
    return {
      totalModules: stats.totalModules,
      totalUsers: stats.totalUsersCount,
      totalRuns: stats.totalRunsCount,
      // Hardcoded until we have real data
      hoursaved: Math.floor(stats.totalRunsCount * 4.5), // ~4.5 hours saved per run
      successRate: 98.2,
    };
  }

  // ── Get single module ─────────────────────────────────────

  async findOne(idOrSlug: string): Promise<ModuleDocument> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    const module = await this.moduleModel.findOne({ ...filter, isDeleted: false }).lean();
    if (!module) throw new NotFoundException('Module not found');
    return module as any;
  }

  // ── Admin CRUD ────────────────────────────────────────────

  async create(data: Partial<ModuleTemplate>): Promise<ModuleDocument> {
    if (data.slug) {
      const existing = await this.moduleModel.findOne({ slug: data.slug });
      if (existing) throw new BadRequestException(`Slug "${data.slug}" already exists`);
    }
    return this.moduleModel.create(data);
  }

  async update(idOrSlug: string, data: Partial<ModuleTemplate>): Promise<ModuleDocument> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    const module = await this.moduleModel.findOneAndUpdate(
      { ...filter, isDeleted: false },
      data,
      { new: true }
    );
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async softDelete(idOrSlug: string): Promise<void> {
    const filter = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };

    await this.moduleModel.findOneAndUpdate(filter, { isDeleted: true, isActive: false });
  }

  // ── Stats update (called by pipeline) ────────────────────

  async incrementStats(moduleId: string, cost: number): Promise<void> {
    await this.moduleModel.findByIdAndUpdate(moduleId, {
      $inc: { totalRunsCount: 1, totalUsersCount: 0 },
      $set: { avgCostPerRun: cost },
    });
  }

  async incrementUserCount(moduleId: string): Promise<void> {
    await this.moduleModel.findByIdAndUpdate(moduleId, {
      $inc: { totalUsersCount: 1 },
    });
  }
}