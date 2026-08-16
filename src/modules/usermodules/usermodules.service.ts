import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as CryptoJS from 'crypto-js';
import { UserModule, UserModuleDocument, UserModuleStatus } from '../modules/schemas/user-module.schema';
import { ConfigService } from '@nestjs/config';
import { PipelineRun, PipelineRunDocument } from '../pipeline-runs/schemas/pipeline-run.schema';
import axios from 'axios';
import { PipelineRunsService } from '../pipeline-runs/pipeline-runs.service';
import { EmailService } from '../email/email.service';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class UserModulesService {
  constructor(
    @InjectModel(UserModule.name)
    private userModuleModel: Model<UserModuleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private config: ConfigService,
    @InjectModel(PipelineRun.name) private pipelineRunModel: Model<PipelineRunDocument>,
    private readonly pipelineRunsService: PipelineRunsService,
    private readonly emailService: EmailService
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
    country?: string;
    nicheSlug?: string;
    pipelineCategory?: string;
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

    const newModule = await this.userModuleModel.create({
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
      country: data.country || 'UAE',
      nicheSlug: data.nicheSlug || 'content_social',
      pipelineCategory: data.pipelineCategory || 'standalone',
    });

    // Send email AFTER successful creation
    try {
      const user = await this.userModel.findById(data.userId).lean();
      if (user) {
        await this.emailService.sendTrialStartedEmail(
          { name: (user as any).name, email: (user as any).email },
          { moduleName: data.moduleName, trialEndDate: trialEnd }
        );
      }
    } catch (e) {
      console.warn(`[Modules] Trial email failed: ${e.message}`);
    }

    return newModule;
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
      $inc: { totalRuns: 1, totalCost: cost },  // ← totalCost was not being incremented
      lastRunAt: new Date(),
    });
  }

  // ── Billing summary ───────────────────────────────────────

  async getBillingSummary(userId: string) {
    const modules = await this.userModuleModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .lean();
  
    // Get actual usage cost from pipeline runs
    const runs = await this.pipelineRunModel
      .find({ userId: new Types.ObjectId(userId), isDeleted: false })
      .select('moduleType totalCost')
      .lean();
  
    // Sum cost per moduleType
    const costByType: Record<string, number> = {};
    for (const run of runs) {
      const key = run.moduleType || 'unknown';
      costByType[key] = (costByType[key] || 0) + (run.totalCost || 0);
    }
  
    const totalUsageCost = runs.reduce((sum, r) => sum + (r.totalCost || 0), 0);
    const totalRuns = runs.length;
  
    const byModule = modules.map(m => ({
      name: m.moduleName,
      moduleType: m.moduleType,
      amount: costByType[m.pipelineType] || 0,  // real usage cost
      status: m.status,
      totalRuns: runs.filter(r => r.moduleType === m.pipelineType).length,
    }));
  
    return {
      total: totalUsageCost,  // real usage cost
      byModule,
      count: modules.length,
      totalRuns,
    };
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
    const m = userModule as any;
 
    // ── Create pipeline run record in DB BEFORE calling Python ──
    const runId = `${m.pipelineType}_${userId.slice(-8)}_${Date.now()}`;
    console.log(`[Pipeline] pipelineRunsService available: ${!!this.pipelineRunsService}`);
    console.log(`[Pipeline] Creating run record with runId: ${runId}`);
    try {
      await this.pipelineRunsService.create({
        userId,
        runId,
        moduleType: m.pipelineType,
        niche: m.niche || 'general',
        agentId: userModuleId,  // ← make sure this is being passed
      });
      console.log(`[Pipeline] Created run record: ${runId}`);
    } catch (e) {
      console.error(`[Pipeline] Failed to create run record: ${e.message}`);
      console.error(`[Pipeline] Stack: ${e.stack}`);
      // Continue anyway — don't block pipeline for DB failure
    }
 
    // ── Build payload ─────────────────────────────────────────
    const payload: any = {
      pipeline_type: m.pipelineType,
      user_id: userId,
      niche: m.niche || 'general',
      user_module_id: userModuleId,
      run_id: runId,  // ← pass runId to Python
      custom_prompt: m.customPrompt || null,
      use_custom_prompt: m.useCustomPrompt || false,
    };
 
    if (m.pipelineType === 'instagram') {
      try {
        const ApiKeyModel = this.userModuleModel.db.model('ApiKey');
        const igKey = await ApiKeyModel
          .findOne({ userId: new Types.ObjectId(userId), provider: 'instagram_oauth', isActive: true })
          .select('+encryptedKey');

        if (!igKey) throw new BadRequestException('Instagram not connected — please connect your account from the Modules page');

        const encryptionKey = this.config.get('ENCRYPTION_KEY');
        const bytes = CryptoJS.AES.decrypt(igKey.encryptedKey, encryptionKey);
        const tokenData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

        if (tokenData.expiry_date < Date.now()) {
          throw new BadRequestException('Instagram token expired — please reconnect your account from the Modules page');
        }

        payload.instagram_account_id = tokenData.account_id || '';
        payload.instagram_access_token = tokenData.access_token || '';
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Failed to load Instagram credentials — please reconnect your account');
      }
    }
 
    if (m.pipelineType === 'youtube') {
      payload.youtube_channel_id = m.youtubeChannelId || '';
      payload.video_model = m.videoModel || 'auto';
    }
 
    // ── Update module stats ───────────────────────────────────
    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      lastRunAt: new Date(),
      $inc: { totalRuns: 1 },
    });
 
    // ── Fire and forget — pipeline takes 15-25 min ────────────
    axios.post(`${pythonUrl}/pipeline/run`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 0,
    })
      .then((res) => {
        console.log(`[Pipeline] Started: ${runId}`, res.data);
      })
      .catch((err) => {
        if (err.code !== 'ECONNABORTED') {
          console.error(`[Pipeline] Error: ${err.message}`);
        }
      });
 
    return {
      success: true,
      runId,
      message: 'Pipeline started. You will be notified when complete.',
    };
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
    // Railway runs in UTC — convert to check against stored times
    const currentHour = now.getUTCHours();
    const currentMin  = now.getUTCMinutes();
    const currentDay  = now.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
 
    const modules = await this.userModuleModel.find({
      status: { $in: ['active', 'trial'] },
      scheduleFrequency: { $in: ['daily', 'weekly'] },
      isDeleted: false,
    }).lean();
 
    let ran = 0;
    let skipped = 0;
 
    for (const module of modules) {
      try {
        const m = module as any;
 
        // Parse schedule time — stored as "HH:MM" in UAE time (UTC+4)
        const scheduleTime = m.scheduleTime || '22:30';
        const [schedHourUAE, schedMin] = scheduleTime.split(':').map(Number);
 
        // Convert UAE (UTC+4) → UTC by subtracting 4 hours
        const schedHourUTC = (schedHourUAE - 4 + 24) % 24;
 
        // Check if within 15 minute window
        const scheduledMinutes = schedHourUTC * 60 + schedMin;
        const currentMinutes   = currentHour * 60 + currentMin;
        const withinWindow = Math.abs(currentMinutes - scheduledMinutes) <= 1;
 
        if (!withinWindow) { skipped++; continue; }
 
        // For weekly: check if today is one of the selected days
        if (m.scheduleFrequency === 'weekly') {
          const scheduleDays: string[] = m.scheduleDays || ['1']; // default Monday
          if (!scheduleDays.includes(String(currentDay))) {
            skipped++; continue;
          }
        }
 
        // Check if already ran today (UTC date) to prevent double runs
        if (m.lastRunAt) {
          const lastRun = new Date(m.lastRunAt);
          const sameDay =
            lastRun.getUTCFullYear() === now.getUTCFullYear() &&
            lastRun.getUTCMonth()    === now.getUTCMonth() &&
            lastRun.getUTCDate()     === now.getUTCDate();
          if (sameDay) { skipped++; continue; }
        }
 
        // console.log(`[Cron] Running pipeline for module ${m._id} (${m.moduleName})`);
        await this.runPipeline(
          m._id.toString(),
          m.userId.toString(),
        );
        ran++;
 
      } catch (e) {
        console.error(`[Cron] Failed module ${(module as any)._id}: ${e}`);
        skipped++;
      }
    }
 
    // console.log(`[Cron] ✓ Ran ${ran} pipelines, skipped ${skipped}`);
    return { ran, skipped };
  }

  async getAtlasModels(pipelineType: string = 'youtube') {
    const ATLAS_API_KEY = process.env.ATLAS_API_KEY || '';
 
    // Map pipeline type to Atlas model category
    const categoryMap: Record<string, string[]> = {
      youtube:    ['TEXT-TO-VIDEO'],
      instagram:  ['TEXT-TO-VIDEO'],
      podcast:    ['TEXT-TO-AUDIO'],
      realestate: ['TEXT-TO-VIDEO', 'IMAGE-TO-VIDEO'],
      marketing:  ['TEXT-TO-VIDEO', 'TEXT-TO-IMAGE'],
    };
 
    const categories = categoryMap[pipelineType] || ['TEXT-TO-VIDEO'];
 
    // Auto option always first
    const autoOption = {
      id: 'auto',
      name: 'Auto (Recommended)',
      provider: 'LogicMate',
      pricePerClip: null,
      desc: 'Best model selected automatically based on quality & cost',
      tags: [],
    };
 
    try {
      const response = await axios.get('https://api.atlascloud.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${ATLAS_API_KEY}` },
        timeout: 8000,
      });
 
      const allModels = response.data?.data || [];
 
      // Filter text-to-video models only, with pricing, display_console=true
      const filtered = allModels
        .filter((m: any) => {
          const hasCategory = m.categories?.some((c: string) =>
            categories.includes(c)
          );
          const hasPrice = m.price?.actual?.base_price;
          const isActive = m.display_console === true;
          const isVideo = m.type === 'Video';
          return hasCategory && hasPrice && isActive && isVideo;
        })
        .map((m: any) => ({
          id: m.model,
          name: m.displayName,
          provider: m.organization,
          pricePerClip: parseFloat(m.price.actual.base_price),
          desc: m.profile?.slice(0, 80) || `${m.organization} video model`,
          tags: m.tags || [],
          logo: m.logo || null,
        }))
        // Sort by price ascending (cheapest first)
        .sort((a: any, b: any) => a.pricePerClip - b.pricePerClip)
        // Only show text-to-video, limit to 8 models
        .filter((m: any) => m.id.includes('text-to-video'))
        .slice(0, 8);
 
      return { models: [autoOption, ...filtered], source: 'live' };
 
    } catch (e) {
      console.error(`[AtlasModels] Failed to fetch live models: ${e.message}`);
      // Fallback to hardcoded if API fails
      return {
        source: 'fallback',
        models: [
          autoOption,
          { id: 'alibaba/wan-2.6/text-to-video', name: 'Wan 2.6', provider: 'Alibaba', pricePerClip: 0.35, desc: 'Cost-effective, great cinematic quality', tags: ['TEXT-TO-VIDEO'] },
          { id: 'bytedance/seedance-2.0-fast/text-to-video', name: 'Seedance 2.0 Fast', provider: 'ByteDance', pricePerClip: 0.78, desc: 'High quality, faster generation', tags: ['TEXT-TO-VIDEO'] },
          { id: 'bytedance/seedance-2.0/text-to-video', name: 'Seedance 2.0', provider: 'ByteDance', pricePerClip: 0.97, desc: 'Best quality, premium', tags: ['TEXT-TO-VIDEO'] },
        ],
      };
    }
  }

  async getExpired() {
    const now = new Date();
    return this.userModuleModel.find({
      status: UserModuleStatus.TRIAL,
      trialEndDate: { $lt: now },
      isFreeForever: false,
      isDeleted: false,
    }).populate('userId', 'name email').lean();
  }
 
  // ── Expire and pause a module ─────────────────────────────
  async expireModule(userModuleId: string): Promise<void> {
    await this.userModuleModel.findByIdAndUpdate(userModuleId, {
      status: UserModuleStatus.EXPIRED,
    });
  }
}