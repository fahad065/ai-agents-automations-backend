import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserModule, UserModuleDocument, UserModuleStatus } from '../modules/schemas/user-module.schema';
import { ConfigService } from '@nestjs/config';
import { PipelineRun, PipelineRunDocument } from '../pipeline-runs/schemas/pipeline-run.schema';

@Injectable()
export class UserModulesService {
  constructor(
    @InjectModel(UserModule.name)
    private userModuleModel: Model<UserModuleDocument>,
    private config: ConfigService,
    @InjectModel(PipelineRun.name) private pipelineRunModel: Model<PipelineRunDocument>,
  ) {}

  // ── Subscribe to a module ─────────────────────────────────

  async subscribe(data: {
    userId: string;
    moduleId: string;
    moduleName: string;
    moduleType: string;
    pipelineType: string;
    name: string;
    config?: Record<string, any>;
    apiKeyMode?: string;
    billingAmount?: number;
    niche?: string;
  }): Promise<UserModuleDocument> {
    // Check already subscribed
    const existing = await this.userModuleModel.findOne({
      userId: new Types.ObjectId(data.userId),
      moduleId: new Types.ObjectId(data.moduleId),
      isDeleted: false,
    });
    if (existing) throw new BadRequestException('Already subscribed to this module');

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    return this.userModuleModel.create({
      userId: new Types.ObjectId(data.userId),
      moduleId: new Types.ObjectId(data.moduleId),
      moduleName: data.moduleName,
      moduleType: data.moduleType,
      pipelineType: data.pipelineType,
      name: data.name,
      config: data.config || {},
      status: UserModuleStatus.TRIAL,
      planType: 'free_trial',
      apiKeyMode: data.apiKeyMode || 'own_keys',
      billingAmount: data.billingAmount || 0,
      trialEndDate: trialEnd,
      niche: data.niche,
    });
  }

  // ── Get user's modules ────────────────────────────────────

  async findByUser(userId: string, options: {
    moduleType?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { moduleType, status, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const filter: any = {
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    };
    if (moduleType) filter.moduleType = moduleType;
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      this.userModuleModel
        .find(filter)
        .populate('moduleId', 'name icon color category pipelineType capabilities pricing estimatedCostPerRun platforms')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModuleModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Get single user module ────────────────────────────────

  async findOne(userModuleId: string, userId: string): Promise<UserModuleDocument> {
    const um = await this.userModuleModel
      .findOne({
        _id: new Types.ObjectId(userModuleId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .populate('moduleId')
      .lean();
    if (!um) throw new NotFoundException('Module not found');
    return um as any;
  }

  // ── Update user module ────────────────────────────────────

  async update(userModuleId: string, userId: string, data: {
    name?: string;
    config?: Record<string, any>;
    niche?: string;
    scheduleFrequency?: string;
    scheduleTime?: string;
    youtubeChannelId?: string;
    status?: string;
  }): Promise<UserModuleDocument> {
    const um = await this.userModuleModel.findOneAndUpdate(
      { _id: new Types.ObjectId(userModuleId), userId: new Types.ObjectId(userId), isDeleted: false },
      data,
      { new: true }
    );
    if (!um) throw new NotFoundException('Module not found');
    return um;
  }

  // ── Toggle pause/resume ───────────────────────────────────

  async toggle(userModuleId: string, userId: string): Promise<UserModuleDocument> {
    const um = await this.userModuleModel.findOne({
      _id: new Types.ObjectId(userModuleId),
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    });
    if (!um) throw new NotFoundException('Module not found');

    const newStatus = um.status === UserModuleStatus.ACTIVE || um.status === UserModuleStatus.TRIAL
      ? UserModuleStatus.PAUSED
      : UserModuleStatus.ACTIVE;

    um.status = newStatus;
    await um.save();
    return um;
  }

  // ── Soft delete ───────────────────────────────────────────

  async softDelete(userModuleId: string, userId: string): Promise<void> {
    await this.userModuleModel.findOneAndUpdate(
      { _id: new Types.ObjectId(userModuleId), userId: new Types.ObjectId(userId) },
      { isDeleted: true, deletedAt: new Date(), status: UserModuleStatus.CANCELLED }
    );
  }

  // ── Admin: get all user modules ───────────────────────────

  async findAll(options: {
    userId?: string;
    moduleType?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { userId, moduleType, status, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (userId) filter.userId = new Types.ObjectId(userId);
    if (moduleType) filter.moduleType = moduleType;
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      this.userModuleModel
        .find(filter)
        .populate('userId', 'name email')
        .populate('moduleId', 'name icon color')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModuleModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Admin: extend trial ───────────────────────────────────

  async extendTrial(userModuleId: string, days: number, adminId: string): Promise<void> {
    const um = await this.userModuleModel.findById(userModuleId);
    if (!um) throw new NotFoundException('User module not found');

    const base = um.trialEndDate > new Date() ? um.trialEndDate : new Date();
    base.setDate(base.getDate() + days);

    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      trialEndDate: base,
      extendedUntil: base,
      status: UserModuleStatus.TRIAL,
    });
  }

  // ── Admin: grant free forever ─────────────────────────────

  async grantFreeForever(userModuleId: string, adminId: string): Promise<void> {
    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      isFreeForever: true,
      freeForeverGrantedBy: new Types.ObjectId(adminId),
      planType: 'free_forever',
      status: UserModuleStatus.ACTIVE,
      billingAmount: 0,
    });
  }

  // ── Get active module for pipeline ───────────────────────

  async getActiveModuleForUser(userId: string, pipelineType: string): Promise<UserModuleDocument | null> {
    return this.userModuleModel.findOne({
      userId: new Types.ObjectId(userId),
      pipelineType,
      status: { $in: [UserModuleStatus.ACTIVE, UserModuleStatus.TRIAL] },
      isDeleted: false,
    }).lean() as any;
  }

  // ── Update stats after pipeline run ──────────────────────

  async recordRun(userModuleId: string, cost: number): Promise<void> {
    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      $inc: { totalRuns: 1, totalCost: cost },
      lastRunAt: new Date(),
    });
  }

  // ── Billing summary ───────────────────────────────────────

  async getBillingSummary(userId: string) {
    const modules = await this.userModuleModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .lean();

    const total = modules.reduce((sum, m) => sum + (m.billingAmount || 0), 0);
    const byModule = modules.map(m => ({
      name: m.moduleName,
      moduleType: m.moduleType,
      amount: m.billingAmount || 0,
      status: m.status,
    }));

    return { total, byModule, count: modules.length };
  }

  // ── Check expiring trials ─────────────────────────────────

  async getExpiringSoon(days: number) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.userModuleModel.find({
      status: UserModuleStatus.TRIAL,
      trialEndDate: { $gte: now, $lte: future },
      trialReminderSent: false,
      isFreeForever: false,
      isDeleted: false,
    }).populate('userId', 'name email').lean();
  }

  async markReminderSent(id: string): Promise<void> {
    await this.userModuleModel.findByIdAndUpdate(id, { trialReminderSent: true });
  }

  async runPipeline(userModuleId: string, userId: string): Promise<any> {
    const userModule = await this.userModuleModel
      .findOne({
        _id: new Types.ObjectId(userModuleId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .lean();
 
    if (!userModule) throw new NotFoundException('Module not found');
 
    if (!['active', 'trial'].includes(userModule.status)) {
      throw new BadRequestException(`Module is ${userModule.status} — cannot run`);
    }
 
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'https://pipeline.logicmate.io';
 
    // Build payload
    const payload: any = {
      pipeline_type: userModule.pipelineType,
      user_id: userId,
      niche: userModule.niche || 'general',
      user_module_id: userModuleId,
    };
 
    if (userModule.pipelineType === 'instagram') {
      const config = (userModule as any).config || {};
      payload.instagram_account_id = config.instagramAccountId || '';
      payload.instagram_access_token = config.instagramAccessToken || '';
    }
 
    if (userModule.pipelineType === 'youtube') {
      payload.youtube_channel_id = (userModule as any).youtubeChannelId || '';
    }
 
    // Call Python service
    const response = await fetch(`${pythonUrl}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
 
    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Pipeline failed to start: ${error}`);
    }
 
    const result = await response.json();
 
    // Update module stats
    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      lastRunAt: new Date(),
      $inc: { totalRuns: 1 },
    });
 
    return { success: true, message: 'Pipeline started', ...result };
  }
 
  async getLatestRunStatus(userModuleId: string, userId: string): Promise<any> {
    try {
      // Query by userId only since schema uses agentId not userModuleId
      const run = await this.pipelineRunModel
        .findOne({
          userId: new Types.ObjectId(userId),
        })
        .sort({ createdAt: -1 })
        .lean();
 
      if (!run) return { status: 'no_runs', message: 'No pipeline runs yet' };
      return run;
    } catch {
      return { status: 'no_runs', message: 'No pipeline runs yet' };
    }
  }


  // ── Run all scheduled modules that are due ────────────────
  async runScheduledModules(): Promise<{ ran: number; skipped: number }> {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentDay = now.getDay(); // 0=Sunday, 1=Monday
 
    // Find all active/trial modules with a schedule
    const modules = await this.userModuleModel.find({
      status: { $in: ['active', 'trial'] },
      scheduleFrequency: { $in: ['daily', 'weekly'] },
      isDeleted: false,
    }).lean();
 
    let ran = 0;
    let skipped = 0;
 
    for (const module of modules) {
      try {
        const scheduleTime = module.scheduleTime || '08:00';
        const [schedHour, schedMin] = scheduleTime.split(':').map(Number);
 
        // Check if within 15 minute window of scheduled time
        const scheduledMinutes = schedHour * 60 + schedMin;
        const currentMinutes = currentHour * 60 + currentMin;
        const withinWindow = Math.abs(currentMinutes - scheduledMinutes) <= 15;
 
        if (!withinWindow) { skipped++; continue; }
 
        // Weekly — only run on Monday
        if (module.scheduleFrequency === 'weekly' && currentDay !== 1) {
          skipped++; continue;
        }
 
        // Check if already ran today
        if (module.lastRunAt) {
          const lastRun = new Date(module.lastRunAt);
          const isToday = lastRun.toDateString() === now.toDateString();
          if (isToday) { skipped++; continue; }
        }
 
        // Run the pipeline
        await this.runPipeline(
          module._id.toString(),
          module.userId.toString(),
        );
        ran++;
      } catch (e) {
        console.error(`[Cron] Failed to run module ${module._id}: ${e}`);
        skipped++;
      }
    }
 
    console.log(`[Cron] Ran ${ran} pipelines, skipped ${skipped}`);
    return { ran, skipped };
  }
}