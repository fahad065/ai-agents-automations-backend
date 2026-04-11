import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('UserAgent') private agentModel: Model<any>,
    @InjectModel('AgentTemplate') private templateModel: Model<any>,
    @InjectModel('ContentIdea') private ideaModel: Model<any>,
  ) {}

  // ─── Overview ───────────────────────────────────────────────

  async getOverview() {
    const [
      totalUsers,
      activeUsers,
      totalAgents,
      activeAgents,
      totalVideos,
      uploadedVideos,
      totalPipelines,
      failedPipelines,
    ] = await Promise.all([
      this.userModel.countDocuments({ isDeleted: { $ne: true } }),
      this.userModel.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
      this.agentModel.countDocuments({ isDeleted: { $ne: true } }),
      this.agentModel.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      this.ideaModel.countDocuments({ isDeleted: false }),
      this.ideaModel.countDocuments({ status: 'uploaded', isDeleted: false }),
      this.ideaModel.countDocuments({ isDeleted: false }),
      this.ideaModel.countDocuments({ status: 'failed', isDeleted: false }),
    ]);

    // New users last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsersThisMonth = await this.userModel.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isDeleted: { $ne: true },
    });

    // Videos by day (last 30 days)
    const videosByDay = await this.ideaModel.aggregate([
      {
        $match: {
          status: 'uploaded',
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Users by day (last 30 days)
    const usersByDay = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      stats: {
        totalUsers,
        activeUsers,
        newUsersThisMonth,
        totalAgents,
        activeAgents,
        totalVideos,
        uploadedVideos,
        totalPipelines,
        failedPipelines,
        successRate: totalPipelines > 0
          ? Math.round((uploadedVideos / totalPipelines) * 100)
          : 0,
      },
      charts: { videosByDay, usersByDay },
    };
  }

  // ─── Users ───────────────────────────────────────────────────

  async getUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: { $ne: true } };

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.role) filter.role = query.role;
    if (query.status === 'active') filter.isActive = true;
    if (query.status === 'suspended') filter.isActive = false;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    // Attach agent count per user
    const userIds = users.map((u: any) => u._id);
    const agentCounts = await this.agentModel.aggregate([
      { $match: { userId: { $in: userIds }, isDeleted: { $ne: true } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const agentCountMap = Object.fromEntries(
      agentCounts.map((a: any) => [a._id.toString(), a.count])
    );

    const videoCounts = await this.ideaModel.aggregate([
      { $match: { userId: { $in: userIds }, isDeleted: false } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const videoCountMap = Object.fromEntries(
      videoCounts.map((v: any) => [v._id.toString(), v.count])
    );

    return {
      users: users.map((u: any) => ({
        ...u,
        agentCount: agentCountMap[u._id.toString()] || 0,
        videoCount: videoCountMap[u._id.toString()] || 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken')
      .lean();
    if (!user) throw new NotFoundException('User not found');

    const [agents, videos] = await Promise.all([
      this.agentModel.find({ userId: new Types.ObjectId(userId) }).lean(),
      this.ideaModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title status youtubeUrl createdAt')
        .lean(),
    ]);

    return { user, agents, recentVideos: videos };
  }

  async updateUser(userId: string, dto: {
    role?: string;
    isActive?: boolean;
    plan?: string;
    name?: string;
  }) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');

    if (dto.role && !['user', 'admin'].includes(dto.role)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: dto },
      { new: true },
    ).select('-password -refreshToken');

    if (!user) throw new NotFoundException('User not found');
    return { message: 'User updated', user };
  }

  async deleteUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isDeleted: true, isActive: false },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    // Deactivate all their agents
    await this.agentModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { status: 'paused' },
    );
    return { message: 'User deleted' };
  }

  async impersonateUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User not found');
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    // Returns user data — frontend stores as impersonation session
    return { user, impersonating: true };
  }

  // ─── Modules (Agent Templates) ────────────────────────────

  async getModules() {
    return this.templateModel.find().sort({ createdAt: -1 }).lean();
  }

  async createModule(dto: {
    name: string;
    slug: string;
    description: string;
    category: string;
    capabilities: string[];
    isActive?: boolean;
  }) {
    const existing = await this.templateModel.findOne({ slug: dto.slug });
    if (existing) throw new BadRequestException('Module with this slug already exists');
    return this.templateModel.create(dto);
  }

  async updateModule(moduleId: string, dto: any) {
    if (!Types.ObjectId.isValid(moduleId)) throw new NotFoundException('Module not found');
    const module = await this.templateModel.findByIdAndUpdate(
      moduleId, { $set: dto }, { new: true }
    );
    if (!module) throw new NotFoundException('Module not found');
    return { message: 'Module updated', module };
  }

  async deleteModule(moduleId: string) {
    if (!Types.ObjectId.isValid(moduleId)) throw new NotFoundException('Module not found');
    await this.templateModel.findByIdAndDelete(moduleId);
    return { message: 'Module deleted' };
  }

  // ─── Pipeline logs ────────────────────────────────────────

  async getPipelineLogs(query: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (query.status) filter.status = query.status;
    if (query.userId && Types.ObjectId.isValid(query.userId)) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    const [logs, total] = await Promise.all([
      this.ideaModel
        .find(filter)
        .populate('userId', 'name email')
        .populate('agentId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('title status youtubeUrl createdAt errorMessage userId agentId')
        .lean(),
      this.ideaModel.countDocuments(filter),
    ]);

    return {
      logs, total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── System settings ──────────────────────────────────────

  async getSystemStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalCost,
      weeklyPipelines,
      avgCreditsPerVideo,
    ] = await Promise.all([
      this.agentModel.aggregate([
        { $group: { _id: null, total: { $sum: '$creditsUsed' } } },
      ]),
      this.ideaModel.countDocuments({
        createdAt: { $gte: sevenDaysAgo },
        isDeleted: false,
      }),
      this.agentModel.aggregate([
        { $match: { videosGenerated: { $gt: 0 } } },
        {
          $project: {
            avgCost: { $divide: ['$creditsUsed', '$videosGenerated'] },
          },
        },
        { $group: { _id: null, avg: { $avg: '$avgCost' } } },
      ]),
    ]);

    return {
      totalAtlasCost: totalCost[0]?.total || 0,
      weeklyPipelines,
      avgCostPerVideo: avgCreditsPerVideo[0]?.avg || 1.32,
      systemVersion: '1.0.0',
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
    };
  }
}