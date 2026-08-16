import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IndustrySubscription, IndustrySubscriptionDocument, IndustrySubStatus } from './industry-subscription.schema';
import { IndustriesService } from '../industries/industries.service';

@Injectable()
export class IndustrySubscriptionsService {
  constructor(
    @InjectModel(IndustrySubscription.name)
    private subModel: Model<IndustrySubscriptionDocument>,
    private industriesService: IndustriesService,
  ) {}

  // ── Subscribe to an industry ─────────────────────────────
  async subscribe(userId: string, industrySlug: string, country = 'UAE', planType = 'free_trial') {
    const existing = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      industrySlug,
      isDeleted: false,
    });
    if (existing) throw new ConflictException('Already subscribed to this industry');

    const industry = await this.industriesService.findBySlug(industrySlug);
    if (!industry) throw new NotFoundException('Industry not found');

    const sub = await this.subModel.create({
      userId: new Types.ObjectId(userId),
      industryId: industry._id,
      industrySlug,
      defaultModuleIds: industry.defaultModuleIds?.map((m: any) => m._id || m) || [],
      addedModuleIds: [],
      basePrice: 0, // will come from industry pricing once set
      addOnPrice: 0,
      totalPrice: 0,
      planType,
      status: IndustrySubStatus.TRIAL,
      country,
      setupComplete: false,
      setupStep: 0,
    });

    return sub.populate(['industryId', 'defaultModuleIds', 'addedModuleIds']);
  }

  // ── Get all subscriptions for a user ─────────────────────
  async getUserSubscriptions(userId: string, lang = 'en') {
    return this.subModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .populate('industryId', 'name name_ar slug icon color description description_ar')
      .populate('defaultModuleIds', 'name name_ar slug icon color moduleType tagline tagline_ar requiredApiKeys')
      .populate('addedModuleIds', 'name name_ar slug icon color moduleType tagline tagline_ar requiredApiKeys pricing')
      .lean();
  }

  // ── Get single subscription ───────────────────────────────
  async getSubscription(userId: string, industrySlug: string) {
    const sub = await this.subModel
      .findOne({ userId: new Types.ObjectId(userId), industrySlug, isDeleted: false })
      .populate('industryId', 'name name_ar slug icon color description description_ar')
      .populate('defaultModuleIds', 'name name_ar slug icon color moduleType tagline tagline_ar requiredApiKeys defaultConfig')
      .populate('addedModuleIds', 'name name_ar slug icon color moduleType tagline tagline_ar requiredApiKeys pricing defaultConfig')
      .lean();
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  // ── Add extra modules ─────────────────────────────────────
  async addModules(userId: string, industrySlug: string, moduleIds: string[]) {
    const sub = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      industrySlug,
      isDeleted: false,
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const newIds = moduleIds.map(id => new Types.ObjectId(id));
    const existing = sub.addedModuleIds.map(id => id.toString());
    const toAdd = newIds.filter(id => !existing.includes(id.toString()));

    sub.addedModuleIds.push(...toAdd);
    await sub.save();
    return sub.populate(['defaultModuleIds', 'addedModuleIds']);
  }

  // ── Remove added module ───────────────────────────────────
  async removeModule(userId: string, industrySlug: string, moduleId: string) {
    const sub = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      industrySlug,
      isDeleted: false,
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    sub.addedModuleIds = sub.addedModuleIds.filter(id => id.toString() !== moduleId) as any;
    await sub.save();
    return sub;
  }

  // ── Setup wizard: save API keys for a module ──────────────
  async saveApiKeys(userId: string, industrySlug: string, moduleId: string, apiKeys: Record<string, string>) {
    const sub = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      industrySlug,
      isDeleted: false,
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const entries = Object.entries(apiKeys).map(([key, value]) => ({ key, value }));
    sub.apiKeys = { ...sub.apiKeys, [moduleId]: entries };
    await sub.save();
    return { message: 'API keys saved' };
  }

  // ── Setup wizard: advance step ────────────────────────────
  async updateSetupStep(userId: string, industrySlug: string, step: number, complete = false) {
    const sub = await this.subModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), industrySlug, isDeleted: false },
      { setupStep: step, ...(complete ? { setupComplete: true } : {}) },
      { new: true },
    );
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  // ── Save module config (schedule, custom name, etc.) ──────
  async saveModuleConfig(userId: string, industrySlug: string, moduleId: string, config: Record<string, any>) {
    const sub = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      industrySlug,
      isDeleted: false,
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    sub.moduleConfigs = { ...sub.moduleConfigs, [moduleId]: config };
    await sub.save();
    return { message: 'Config saved' };
  }

  // ── Cancel subscription ───────────────────────────────────
  async cancel(userId: string, industrySlug: string) {
    const sub = await this.subModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), industrySlug, isDeleted: false },
      { status: IndustrySubStatus.CANCELLED, isDeleted: true },
      { new: true },
    );
    if (!sub) throw new NotFoundException('Subscription not found');
    return { message: 'Subscription cancelled' };
  }

  // ── Admin: get all subscriptions ─────────────────────────
  async adminGetAll(filter: { status?: string; industrySlug?: string } = {}) {
    const q: any = { isDeleted: false };
    if (filter.status) q.status = filter.status;
    if (filter.industrySlug) q.industrySlug = filter.industrySlug;
    return this.subModel
      .find(q)
      .populate('userId', 'email firstName lastName')
      .populate('industryId', 'name slug')
      .sort({ createdAt: -1 })
      .lean();
  }
}
