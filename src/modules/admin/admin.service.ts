import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PipelineRun, PipelineRunDocument } from '../pipeline-runs/schemas/pipeline-run.schema';
import { UserModule as UserModuleModel, UserModuleDocument } from '../modules/schemas/user-module.schema';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PipelineRun.name) private pipelineModel: Model<PipelineRunDocument>,
    @InjectModel(UserModuleModel.name) private userModuleModel: Model<UserModuleDocument>,
    private emailService: EmailService,
  ) {}

  async getOverview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, activeUsers, newUsersThisMonth,
      trialUsers, freeForeverUsers,
      totalAgents, activeAgents,
      totalPipelines, completedPipelines, failedPipelines,
      totalCostResult, videosByDay, usersByDay,
    ] = await Promise.all([
      this.userModel.countDocuments({ isDeleted: { $ne: true } }),
      this.userModel.countDocuments({ isDeleted: { $ne: true }, isActive: true }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.userModel.countDocuments({ planType: 'trial', isFreeForever: { $ne: true } }),
      this.userModel.countDocuments({ isFreeForever: true }),
      this.userModuleModel.countDocuments({}),
      this.userModuleModel.countDocuments({ isActive: true }),
      this.pipelineModel.countDocuments({}),
      this.pipelineModel.countDocuments({ status: { $in: ['complete', 'completed'] } }),
      this.pipelineModel.countDocuments({ status: 'failed' }),
      this.pipelineModel.aggregate([
        { $group: { _id: null, total: { $sum: '$totalCost' } } }
      ]),
      this.pipelineModel.aggregate([
        { $match: { status: { $in: ['complete', 'completed'] }, completedAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.userModel.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      stats: {
        totalUsers, activeUsers, newUsersThisMonth,
        trialUsers, freeForeverUsers,
        totalAgents, activeAgents,
        totalVideos: completedPipelines,
        uploadedVideos: completedPipelines,
        totalPipelines, failedPipelines,
        successRate: totalPipelines > 0 ? Math.round((completedPipelines / totalPipelines) * 100) : 0,
        totalApiCost: Math.round((totalCostResult[0]?.total || 0) * 100) / 100,
      },
      charts: { videosByDay, usersByDay },
    };
  }

  // Per-tenant usage for agents/automations — the analog of the chatbot
  // admin list's per-bot `usage` field (see ChatbotsService.findAllAdmin),
  // for the other half of the platform. getOverview() above only ever
  // sums across every user; this answers "how is user X actually using
  // their pipelines specifically" instead. 4 aggregate/find queries total,
  // batched by userId — not one query per user, same rule every other
  // admin list in this codebase follows.
  async getUsagePerTenant() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [pipelineStats, pipelineStats30d, moduleStatusCounts, users] = await Promise.all([
      this.pipelineModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$userId',
            totalRuns: { $sum: 1 },
            failedRuns: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            lastRunAt: { $max: '$createdAt' },
          },
        },
      ]),
      this.pipelineModel.aggregate([
        { $match: { isDeleted: { $ne: true }, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: '$userId',
            runs30d: { $sum: 1 },
            failedRuns30d: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          },
        },
      ]),
      this.userModuleModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: { userId: '$userId', status: '$status' }, count: { $sum: 1 } } },
      ]),
      this.userModel
        .find({ isDeleted: { $ne: true } })
        .select('_id name email planType trialEndDate isActive')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const pipelineByUser = new Map(pipelineStats.map((s) => [String(s._id), s]));
    const pipeline30dByUser = new Map(pipelineStats30d.map((s) => [String(s._id), s]));

    const moduleStatusByUser = new Map<string, Record<string, number>>();
    for (const row of moduleStatusCounts as any[]) {
      const uid = String(row._id.userId);
      if (!moduleStatusByUser.has(uid)) moduleStatusByUser.set(uid, {});
      moduleStatusByUser.get(uid)![row._id.status] = row.count;
    }

    return users.map((u) => {
      const uid = String((u as any)._id);
      const p = pipelineByUser.get(uid);
      const p30 = pipeline30dByUser.get(uid);
      return {
        userId: uid,
        name: (u as any).name,
        email: (u as any).email,
        planType: (u as any).planType,
        trialEndDate: (u as any).trialEndDate,
        isActive: (u as any).isActive,
        modulesByStatus: moduleStatusByUser.get(uid) || {},
        pipelines: {
          totalRuns: p?.totalRuns || 0,
          failedRuns: p?.failedRuns || 0,
          lastRunAt: p?.lastRunAt || null,
          runs30d: p30?.runs30d || 0,
          failedRuns30d: p30?.failedRuns30d || 0,
        },
      };
    });
  }

  async listUsers() {
    const users = await this.userModel
      .find({ isDeleted: { $ne: true } })
      .select('_id name email')
      .sort({ createdAt: -1 })
      .lean();
    return users;
  }

  async sendCustomEmail(to: string[], subject: string, html: string) {
    const results = await Promise.allSettled(
      to.map(email => this.emailService.sendEmail(email, subject, html)),
    );
    const sent = results.filter(r => r.status === 'fulfilled' && (r as any).value === true).length;
    const failed = to.length - sent;
    return { sent, failed, total: to.length };
  }

  async getRevenue() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [costByModule, topUsers] = await Promise.all([
      this.pipelineModel.aggregate([
        { $match: { totalCost: { $gt: 0 } } },
        { $group: { _id: '$moduleType', totalCost: { $sum: '$totalCost' }, count: { $sum: 1 } } },
        { $sort: { totalCost: -1 } },
      ]),
      this.pipelineModel.aggregate([
        { $match: { totalCost: { $gt: 0 } } },
        { $group: { _id: '$userId', totalCost: { $sum: '$totalCost' }, runs: { $sum: 1 } } },
        { $sort: { totalCost: -1 } }, { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { totalCost: 1, runs: 1, name: '$user.name', email: '$user.email' } },
      ]),
    ]);
    return { costByModule, topUsers };
  }
}