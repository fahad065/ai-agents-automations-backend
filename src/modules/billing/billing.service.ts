import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Billing, BillingDocument, BillingStatus, BillingType } from './schemas/billing.schema';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(Billing.name)
    private billingModel: Model<BillingDocument>,
  ) {}

  // Record a billing event
  async create(data: {
    userId: string;
    moduleType: string;
    moduleName: string;
    amount: number;
    description: string;
    type?: string;
    pipelineRunId?: string;
    subscriptionId?: string;
    apiCosts?: { openai?: number; seedance?: number; atlas?: number };
  }): Promise<BillingDocument> {
    return this.billingModel.create({
      userId: new Types.ObjectId(data.userId),
      moduleType: data.moduleType,
      moduleName: data.moduleName,
      amount: data.amount,
      description: data.description,
      type: data.type || BillingType.USAGE,
      status: BillingStatus.PAID,
      pipelineRunId: data.pipelineRunId ? new Types.ObjectId(data.pipelineRunId) : undefined,
      subscriptionId: data.subscriptionId ? new Types.ObjectId(data.subscriptionId) : undefined,
      apiCosts: data.apiCosts || {},
      billingDate: new Date(),
    });
  }

  // Get billing records
  async findAll(options: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    moduleType?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, startDate, endDate, moduleType, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    const filter: any = { isDeleted: false };

    if (userId) filter.userId = new Types.ObjectId(userId);
    if (moduleType) filter.moduleType = moduleType;
    if (startDate || endDate) {
      filter.billingDate = {};
      if (startDate) filter.billingDate.$gte = startDate;
      if (endDate) filter.billingDate.$lte = endDate;
    }

    const [data, total] = await Promise.all([
      this.billingModel.find(filter).sort({ billingDate: -1 }).skip(skip).limit(limit).lean(),
      this.billingModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // Get monthly summary
  async getMonthlySummary(userId?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const filter: any = {
      isDeleted: false,
      billingDate: { $gte: startOfMonth },
      status: BillingStatus.PAID,
    };
    if (userId) filter.userId = new Types.ObjectId(userId);

    const agg = await this.billingModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$moduleName',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        }
      },
      { $sort: { total: -1 } }
    ]);

    const grandTotal = agg.reduce((sum, a) => sum + a.total, 0);

    return {
      grandTotal: Math.round(grandTotal * 100) / 100,
      byModule: agg.map(a => ({
        moduleName: a._id,
        total: Math.round(a.total * 100) / 100,
        count: a.count,
      })),
      month: startOfMonth.toISOString().slice(0, 7),
    };
  }

  // Get API costs breakdown (for admin payment dashboard)
  async getApiCostsBreakdown(startDate?: Date, endDate?: Date) {
    const filter: any = { isDeleted: false, status: BillingStatus.PAID };
    if (startDate || endDate) {
      filter.billingDate = {};
      if (startDate) filter.billingDate.$gte = startDate;
      if (endDate) filter.billingDate.$lte = endDate;
    }

    const agg = await this.billingModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalOpenAI: { $sum: '$apiCosts.openai' },
          totalSeedance: { $sum: '$apiCosts.seedance' },
          totalAtlas: { $sum: '$apiCosts.atlas' },
          count: { $sum: 1 },
        }
      }
    ]);

    return agg[0] || {
      totalAmount: 0,
      totalOpenAI: 0,
      totalSeedance: 0,
      totalAtlas: 0,
      count: 0,
    };
  }

  // Get profit/loss stats (admin only)
  async getProfitLoss(startDate?: Date, endDate?: Date) {
    const costs = await this.getApiCostsBreakdown(startDate, endDate);

    return {
      revenue: 0,        // Will come from Paddle webhooks
      costs: costs.totalAmount,
      profit: 0 - costs.totalAmount, // revenue - costs
      apiBreakdown: {
        openai: costs.totalOpenAI,
        seedance: costs.totalSeedance,
        atlas: costs.totalAtlas,
      }
    };
  }
}