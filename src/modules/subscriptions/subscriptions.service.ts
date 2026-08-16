import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Subscription, SubscriptionDocument,
  SubscriptionStatus, SubscriptionPlanType,
} from './schemas/subscription.schema';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private subModel: Model<SubscriptionDocument>,
  ) {}

  // Create subscription on module purchase
  async create(data: {
    userId: string;
    moduleId: string;
    moduleType: string;
    moduleName: string;
    planType?: string;
    billingAmount?: number;
  }): Promise<SubscriptionDocument> {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    return this.subModel.create({
      userId: new Types.ObjectId(data.userId),
      moduleId: new Types.ObjectId(data.moduleId),
      moduleType: data.moduleType,
      moduleName: data.moduleName,
      planType: data.planType || SubscriptionPlanType.FREE_TRIAL,
      status: SubscriptionStatus.TRIAL,
      billingAmount: data.billingAmount || 0,
      trialEndDate: trialEnd,
    });
  }

  // Get all subscriptions for user
  async findByUser(userId: string) {
    return this.subModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Get all subscriptions (admin)
  async findAll(options: {
    userId?: string;
    status?: string;
    moduleType?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, status, moduleType, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    const filter: any = { isDeleted: false };

    if (userId) filter.userId = new Types.ObjectId(userId);
    if (status) filter.status = status;
    if (moduleType) filter.moduleType = moduleType;

    const [data, total] = await Promise.all([
      this.subModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.subModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // Check if user has active subscription to a module
  async hasActiveSubscription(userId: string, moduleId: string): Promise<boolean> {
    const sub = await this.subModel.findOne({
      userId: new Types.ObjectId(userId),
      moduleId: new Types.ObjectId(moduleId),
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
      isDeleted: false,
    });
    return !!sub;
  }

  // Admin: extend trial
  async extendTrial(subId: string, days: number, adminId: string): Promise<void> {
    const sub = await this.subModel.findById(subId);
    if (!sub) throw new NotFoundException('Subscription not found');

    const newEnd = new Date(sub.trialEndDate);
    newEnd.setDate(newEnd.getDate() + days);

    await this.subModel.findByIdAndUpdate(subId, {
      trialEndDate: newEnd,
      extendedUntil: newEnd,
      extendedBy: new Types.ObjectId(adminId),
      status: SubscriptionStatus.TRIAL,
    });
  }

  // Admin: set free forever
  async setFreeForever(subId: string, adminId: string): Promise<void> {
    await this.subModel.findByIdAndUpdate(subId, {
      isFreeForever: true,
      freeForeverGrantedBy: new Types.ObjectId(adminId),
      planType: SubscriptionPlanType.FREE_FOREVER,
      status: SubscriptionStatus.ACTIVE,
      billingAmount: 0,
    });
  }

  // Cancel subscription
  async cancel(subId: string, userId: string): Promise<void> {
    await this.subModel.findOneAndUpdate(
      { _id: new Types.ObjectId(subId), userId: new Types.ObjectId(userId) },
      { status: SubscriptionStatus.CANCELLED }
    );
  }

  // Soft delete
  async softDelete(subId: string): Promise<void> {
    await this.subModel.findByIdAndUpdate(subId, { isDeleted: true });
  }

  // Get billing summary per user
  async getBillingSummary(userId: string) {
    const subs = await this.subModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .lean();

    const total = subs.reduce((sum, s) => sum + (s.billingAmount || 0), 0);
    const byModule = subs.map(s => ({
      moduleName: s.moduleName,
      moduleType: s.moduleType,
      amount: s.billingAmount,
      status: s.status,
    }));

    return { total, byModule, count: subs.length };
  }

  // Check and expire trials
  async expireTrials(): Promise<number> {
    const now = new Date();
    const result = await this.subModel.updateMany(
      {
        status: SubscriptionStatus.TRIAL,
        trialEndDate: { $lt: now },
        isFreeForever: false,
        isDeleted: false,
      },
      { status: SubscriptionStatus.EXPIRED }
    );
    return result.modifiedCount;
  }

  // Get subscriptions expiring in N days (for reminder emails)
  async getExpiringSoon(days: number) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.subModel.find({
      status: SubscriptionStatus.TRIAL,
      trialEndDate: { $gte: now, $lte: future },
      trialReminderSent: false,
      isFreeForever: false,
      isDeleted: false,
    }).lean();
  }

  // Mark reminder sent
  async markReminderSent(subId: string): Promise<void> {
    await this.subModel.findByIdAndUpdate(subId, { trialReminderSent: true });
  }
}