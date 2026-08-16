import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PipelineRun, PipelineRunDocument } from '../pipeline-runs/schemas/pipeline-run.schema';
import { UserModule as UserModuleModel, UserModuleDocument } from '../modules/schemas/user-module.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PipelineRun.name) private pipelineModel: Model<PipelineRunDocument>,
    @InjectModel(UserModuleModel.name) private userModuleModel: Model<UserModuleDocument>,
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