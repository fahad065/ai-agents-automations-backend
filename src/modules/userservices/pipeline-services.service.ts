import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';
import * as Sentry from '@sentry/nestjs';
import {
  PIPELINE_FILTER, PipelineUserService, PipelineUserServiceDocument, UserService, UserServiceDocument,
  UserServiceStatus, UserServiceType,
} from './schemas/userservice.schema';
import { PIPELINE_FIELD_PATHS, toPipelineView } from './pipeline-view';
import { Service, ServiceDocument } from '../services/schemas/service.schema';
import { PipelineRun, PipelineRunDocument } from '../pipeline-runs/schemas/pipeline-run.schema';
import { PipelineRunsService } from '../pipeline-runs/pipeline-runs.service';
import { EmailService } from '../email/email.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

// Agents and automations a customer subscribed to — `userservices` rows of
// type 'agent' | 'automation' (replaced `usermodules` on 2026-11-17; there
// was no customer data to move). Chatbots live in the same collection but
// are handled by ChatbotsService.
const SERVICE_POPULATE = 'name slug display pipeline pricing content.capabilities';
const RUNNABLE = [UserServiceStatus.TRIAL, UserServiceStatus.ACTIVE];

@Injectable()
export class PipelineServicesService {
  constructor(
    @InjectModel(PipelineUserService.name) private model: Model<PipelineUserServiceDocument>,
    // Untyped config: used only by the admin subscription actions below,
    // which touch top-level fields and must work for every service type
    // (chatbots included) without re-casting a chatbot's config.
    @InjectModel(UserService.name) private anyServiceModel: Model<UserServiceDocument>,
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PipelineRun.name) private pipelineRunModel: Model<PipelineRunDocument>,
    private readonly config: ConfigService,
    private readonly pipelineRunsService: PipelineRunsService,
    private readonly emailService: EmailService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  private ownFilter(id: string, userId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Service not found');
    return { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId), ...PIPELINE_FILTER, isDeleted: false };
  }

  // ── Subscribe ─────────────────────────────────────────────

  // Starts a 30-day trial of an agent/automation from the catalog. Name,
  // type and pipeline come from the catalog entry, not the request body.
  async subscribe(userId: string, data: {
    moduleId?: string; serviceId?: string; name?: string; niche?: string;
    apiKeyMode?: string; scheduleFrequency?: string; scheduleTime?: string;
  }) {
    const serviceId = data.serviceId || data.moduleId;
    if (!serviceId || !Types.ObjectId.isValid(serviceId)) throw new BadRequestException('Choose a service to subscribe to.');
    const service: any = await this.serviceModel.findOne({ _id: serviceId, isDeleted: false }).lean();
    if (!service) throw new NotFoundException('Service not found');
    if (![UserServiceType.AGENT, UserServiceType.AUTOMATION].includes(service.type)) {
      throw new BadRequestException('Chatbots are started from the chatbot setup, not here.');
    }
    if (service.status !== 'active') throw new BadRequestException('This service is not available yet.');

    const existing = await this.model.exists({
      userId: new Types.ObjectId(userId), serviceId: service._id, ...PIPELINE_FILTER, isDeleted: false,
    });
    if (existing) throw new BadRequestException('You already have this service.');

    const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const frequency = ['daily', 'weekly'].includes(data.scheduleFrequency || '') ? data.scheduleFrequency : 'manual';
    const created = await this.model.create({
      userId: new Types.ObjectId(userId),
      type: service.type,
      serviceId: service._id,
      name: (data.name || '').trim() || service.name,
      status: UserServiceStatus.TRIAL,
      trialEndDate,
      plan: { tier: 'basic', monthlyFee: service.pricing?.monthly || 0, setupFee: 0, currency: 'USD' },
      config: {
        pipelineType: service.pipeline?.pipelineType || 'custom',
        pipelineCategory: service.pipeline?.pipelineCategory || 'standalone',
        nicheSlug: service.nicheSlug,
        niche: data.niche?.trim() || undefined,
        apiKeyMode: data.apiKeyMode === 'platform_keys' ? 'platform_keys' : 'own_keys',
        schedule: { frequency, time: data.scheduleTime || '08:00', days: ['1'] },
      },
    });

    try {
      const user: any = await this.userModel.findById(userId).lean();
      if (user) {
        await this.emailService.sendTrialStartedEmail(
          { name: user.name, email: user.email },
          { moduleName: service.name, trialEndDate },
        );
      }
    } catch (e) {
      console.warn(`[Services] Trial email failed: ${e.message}`);
    }

    await this.activityLogsService.record({
      userId, actorId: userId, actorRole: ActorRole.USER,
      action: ActivityAction.CREATE, entityType: 'userservice', entityId: String(created._id),
      changes: { after: { service: service.name, type: service.type } },
      description: `Subscribed to "${service.name}" (30-day trial)`,
    });

    return toPipelineView({ ...created.toObject(), serviceId: service });
  }

  // ── Read ──────────────────────────────────────────────────

  private listFilter(options: { moduleType?: string; status?: string }) {
    const filter: any = { ...PIPELINE_FILTER, isDeleted: false };
    if (options.moduleType === 'agent' || options.moduleType === 'automation') filter.type = options.moduleType;
    if (options.status === 'paused') filter['config.paused'] = true;
    else if (options.status === 'expired') filter.status = UserServiceStatus.PAST_DUE;
    else if (options.status) filter.status = options.status;
    return filter;
  }

  async findByUser(userId: string, options: { moduleType?: string; status?: string; page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = options;
    const filter = { ...this.listFilter(options), userId: new Types.ObjectId(userId) };
    const [rows, total] = await Promise.all([
      this.model.find(filter).populate('serviceId', SERVICE_POPULATE).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { data: rows.map(toPipelineView), total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findAll(options: { userId?: string; moduleType?: string; status?: string; page?: number; limit?: number } = {}) {
    const { page = 1, limit = 10 } = options;
    const filter: any = this.listFilter(options);
    if (options.userId && Types.ObjectId.isValid(options.userId)) filter.userId = new Types.ObjectId(options.userId);
    const [rows, total] = await Promise.all([
      this.model.find(filter).populate('userId', 'name email').populate('serviceId', SERVICE_POPULATE)
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { data: rows.map(toPipelineView), total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string) {
    const row = await this.model.findOne(this.ownFilter(id, userId)).populate('serviceId', SERVICE_POPULATE).lean();
    if (!row) throw new NotFoundException('Service not found');
    return toPipelineView(row);
  }

  // ── Update ────────────────────────────────────────────────

  async update(id: string, userId: string, data: Record<string, any>) {
    const $set: Record<string, any> = {};
    for (const [key, path] of Object.entries(PIPELINE_FIELD_PATHS)) {
      if (data[key] !== undefined) $set[path] = data[key];
    }
    if ($set['config.schedule.frequency'] && !['manual', 'daily', 'weekly'].includes($set['config.schedule.frequency'])) {
      throw new BadRequestException('Schedule must be manual, daily or weekly.');
    }
    if (!Object.keys($set).length) return this.findOne(id, userId);
    const row = await this.model.findOneAndUpdate(this.ownFilter(id, userId), { $set }, { new: true, runValidators: true })
      .populate('serviceId', SERVICE_POPULATE).lean();
    if (!row) throw new NotFoundException('Service not found');
    return toPipelineView(row);
  }

  // Pause / resume — the customer's own switch for scheduled runs.
  async toggle(id: string, userId: string) {
    const row = await this.model.findOne(this.ownFilter(id, userId));
    if (!row) throw new NotFoundException('Service not found');
    const paused = !row.config.paused;
    row.set('config.paused', paused);
    await row.save();
    await this.activityLogsService.record({
      userId, actorId: userId, actorRole: ActorRole.USER,
      action: ActivityAction.UPDATE, entityType: 'userservice', entityId: id,
      changes: { after: { paused } },
      description: `"${row.name}" ${paused ? 'paused' : 'resumed'}`,
    });
    return toPipelineView(await row.populate('serviceId', SERVICE_POPULATE));
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const row = await this.model.findOneAndUpdate(
      this.ownFilter(id, userId),
      { $set: { isDeleted: true, status: UserServiceStatus.CANCELLED, cancelledAt: new Date() } },
    );
    if (row) {
      await this.activityLogsService.record({
        userId, actorId: userId, actorRole: ActorRole.USER,
        action: ActivityAction.DELETE, entityType: 'userservice', entityId: id,
        changes: { before: { name: row.name } },
        description: `Cancelled "${row.name}"`,
      });
    }
  }

  // ── Admin ─────────────────────────────────────────────────

  // Admin subscription actions (Customer Services → Manage). They act on
  // any userservices row — chatbot, agent or automation — since all three
  // share the same status / trialEndDate / isFreeForever fields.
  private async adminRow(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Service not found');
    const row = await this.anyServiceModel.findOne({ _id: new Types.ObjectId(id), isDeleted: false }).lean();
    if (!row) throw new NotFoundException('Service not found');
    return row;
  }

  async extendTrial(id: string, days: number): Promise<void> {
    const row = await this.adminRow(id);
    const base = row.trialEndDate && row.trialEndDate > new Date() ? new Date(row.trialEndDate) : new Date();
    base.setDate(base.getDate() + Number(days || 0));
    await this.anyServiceModel.updateOne(
      { _id: row._id },
      { $set: { trialEndDate: base, status: UserServiceStatus.TRIAL }, $unset: { trialReminderSentAt: 1 } },
    );
  }

  async grantFreeForever(id: string): Promise<void> {
    const row = await this.adminRow(id);
    await this.anyServiceModel.updateOne(
      { _id: row._id },
      { $set: { isFreeForever: true, status: UserServiceStatus.ACTIVE, 'plan.monthlyFee': 0 } },
    );
  }

  // Ends the subscription but keeps the row (and a chatbot's knowledge base
  // and conversations) so it shows as cancelled and can be looked back at.
  async cancelAsAdmin(id: string, actorId: string): Promise<void> {
    const row = await this.adminRow(id);
    await this.anyServiceModel.updateOne(
      { _id: row._id },
      { $set: { status: UserServiceStatus.CANCELLED, cancelledAt: new Date(), isFreeForever: false } },
    );
    await this.activityLogsService.record({
      userId: String(row.userId), actorId, actorRole: ActorRole.ADMIN,
      action: ActivityAction.UPDATE, entityType: 'userservice', entityId: id,
      changes: { before: { status: row.status }, after: { status: UserServiceStatus.CANCELLED } },
      description: `Admin cancelled "${row.name}"`,
    });
  }

  // ── Runs ──────────────────────────────────────────────────

  // Called by the Python service when a run finishes (PipelineSecretGuard).
  async recordRun(id: string, cost: number): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.updateOne(
      { _id: id, ...PIPELINE_FILTER },
      { $inc: { 'config.totalCost': cost }, $set: { 'config.lastRunAt': new Date() } },
    );
  }

  async runPipeline(id: string, userId: string): Promise<any> {
    const row: any = await this.model.findOne(this.ownFilter(id, userId)).lean();
    if (!row) throw new NotFoundException('Service not found');
    if (!RUNNABLE.includes(row.status)) {
      throw new BadRequestException(row.status === UserServiceStatus.PAST_DUE
        ? 'Your trial has ended — renew to keep running this service.'
        : `This service is ${row.status} — it can't run.`);
    }
    const c = row.config || {};
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'https://pipeline.logicmate.io';
    const runId = `${c.pipelineType}_${userId.slice(-8)}_${Date.now()}`;

    try {
      await this.pipelineRunsService.create({
        userId, runId, moduleType: c.pipelineType, niche: c.niche || 'general', agentId: id,
      });
    } catch (e) {
      console.error(`[Pipeline] Failed to create run record: ${e.message}`);
    }

    // `user_module_id` keeps its name: the Python service sends it back to
    // /userservices/:id/record-run.
    const payload: any = {
      pipeline_type: c.pipelineType,
      user_id: userId,
      niche: c.niche || 'general',
      user_module_id: id,
      run_id: runId,
      custom_prompt: c.customPrompt || null,
      use_custom_prompt: !!c.useCustomPrompt,
    };

    if (c.pipelineType === 'instagram') {
      try {
        const ApiKeyModel = this.model.db.model('ApiKey');
        const igKey: any = await ApiKeyModel
          .findOne({ userId: new Types.ObjectId(userId), provider: 'instagram_oauth', status: 'active' })
          .select('+encryptedKey');
        if (!igKey) throw new BadRequestException('Instagram not connected — connect your account from My Services.');
        const bytes = CryptoJS.AES.decrypt(igKey.encryptedKey, this.config.get<string>('ENCRYPTION_KEY') || '');
        const tokenData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        if (tokenData.expiry_date < Date.now()) {
          throw new BadRequestException('Instagram token expired — reconnect your account from My Services.');
        }
        payload.instagram_account_id = tokenData.account_id || '';
        payload.instagram_access_token = tokenData.access_token || '';
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Failed to load Instagram credentials — please reconnect your account');
      }
    }
    if (c.pipelineType === 'youtube') {
      payload.youtube_channel_id = c.youtubeChannelId || '';
      payload.video_model = c.videoModel || 'auto';
    }

    await this.model.updateOne({ _id: id }, { $set: { 'config.lastRunAt': new Date() }, $inc: { 'config.totalRuns': 1 } });

    // Fire and forget — a pipeline takes 15-25 minutes.
    axios.post(`${pythonUrl}/pipeline/run`, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 0 })
      .then((res) => console.log(`[Pipeline] Started: ${runId}`, res.data))
      .catch((err) => {
        if (err.code !== 'ECONNABORTED') {
          console.error(`[Pipeline] Error: ${err.message}`);
          Sentry.captureException(err, { tags: { tenantUserId: userId, userServiceId: id, runId, pipelineType: c.pipelineType } });
        }
      });

    return { success: true, runId, message: 'Pipeline started. You will be notified when complete.' };
  }

  async getLatestRunStatus(id: string, userId: string): Promise<any> {
    try {
      const run = await this.pipelineRunModel
        .findOne({ userId: new Types.ObjectId(userId), agentId: new Types.ObjectId(id) })
        .sort({ createdAt: -1 })
        .lean();
      return run || { status: 'no_runs', message: 'No pipeline runs yet' };
    } catch (err) {
      console.error(`[Pipeline] run-status lookup failed for ${id}: ${err?.message}`);
      return { status: 'no_runs', message: 'No pipeline runs yet' };
    }
  }

  // Runs every service whose schedule is due this minute. Schedule times are
  // stored in UAE time (UTC+4). Each row is claimed atomically for the day
  // (config.lastRunAt) before running, so two replicas never both run it.
  async runScheduledServices(): Promise<{ ran: number; skipped: number }> {
    const now = new Date();
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const currentDay = String(now.getUTCDay());
    const rows: any[] = await this.model.find({
      ...PIPELINE_FILTER,
      isDeleted: false,
      status: { $in: RUNNABLE },
      'config.paused': { $ne: true },
      'config.schedule.frequency': { $in: ['daily', 'weekly'] },
    }).lean();

    let ran = 0;
    let skipped = 0;
    const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const row of rows) {
      try {
        const schedule = row.config?.schedule || {};
        const [hourUAE, minute] = String(schedule.time || '08:00').split(':').map(Number);
        const scheduled = ((hourUAE - 4 + 24) % 24) * 60 + minute;
        if (Math.abs(currentMinutes - scheduled) > 1) { skipped++; continue; }
        if (schedule.frequency === 'weekly' && !(schedule.days || ['1']).includes(currentDay)) { skipped++; continue; }

        const claimed = await this.model.findOneAndUpdate(
          { _id: row._id, $or: [{ 'config.lastRunAt': { $exists: false } }, { 'config.lastRunAt': { $lt: startOfTodayUTC } }] },
          { $set: { 'config.lastRunAt': now } },
        );
        if (!claimed) { skipped++; continue; }
        await this.runPipeline(String(row._id), String(row.userId));
        ran++;
      } catch (e) {
        console.error(`[Cron] Failed service ${row._id}: ${e}`);
        Sentry.captureException(e, { tags: { tenantUserId: String(row.userId), userServiceId: String(row._id) } });
        skipped++;
      }
    }
    return { ran, skipped };
  }

  // ── Trials (used by PipelineServicesCron) ─────────────────

  async getExpiringSoon(days: number) {
    const now = new Date();
    return this.model.find({
      ...PIPELINE_FILTER,
      status: UserServiceStatus.TRIAL,
      trialEndDate: { $gte: now, $lte: new Date(now.getTime() + days * 86400000) },
      trialReminderSentAt: { $exists: false },
      isFreeForever: { $ne: true },
      isDeleted: false,
    }).populate('userId', 'name email').lean();
  }

  // True only for the replica whose update set the reminder date.
  async claimReminderSent(id: string): Promise<boolean> {
    const res = await this.model.findOneAndUpdate(
      { _id: id, trialReminderSentAt: { $exists: false } },
      { $set: { trialReminderSentAt: new Date() } },
    );
    return !!res;
  }

  async getExpired() {
    return this.model.find({
      ...PIPELINE_FILTER,
      status: UserServiceStatus.TRIAL,
      trialEndDate: { $lt: new Date() },
      isFreeForever: { $ne: true },
      isDeleted: false,
    }).populate('userId', 'name email').lean();
  }

  // Trial ended unpaid → past_due. True only for the replica that changed it.
  async claimExpire(id: string): Promise<boolean> {
    const res = await this.model.findOneAndUpdate(
      { _id: id, status: UserServiceStatus.TRIAL },
      { $set: { status: UserServiceStatus.PAST_DUE } },
    );
    return !!res;
  }

  // ── Billing summary (dashboard overview) ──────────────────

  async getBillingSummary(userId: string) {
    const uid = new Types.ObjectId(userId);
    const [rows, runs] = await Promise.all([
      this.model.find({ userId: uid, ...PIPELINE_FILTER, isDeleted: false }).populate('serviceId', 'name').lean(),
      this.pipelineRunModel.find({ userId: uid, isDeleted: false }).select('moduleType totalCost').lean(),
    ]);
    const costByType: Record<string, number> = {};
    for (const run of runs as any[]) costByType[run.moduleType || 'unknown'] = (costByType[run.moduleType || 'unknown'] || 0) + (run.totalCost || 0);
    const views = rows.map(toPipelineView);
    return {
      total: (runs as any[]).reduce((sum, r) => sum + (r.totalCost || 0), 0),
      byModule: views.map((v) => ({
        name: v.moduleName,
        moduleType: v.moduleType,
        amount: costByType[v.pipelineType] || 0,
        status: v.status,
        totalRuns: (runs as any[]).filter((r) => r.moduleType === v.pipelineType).length,
      })),
      count: views.length,
      totalRuns: runs.length,
    };
  }

  // ── Atlas video models (YouTube/Instagram agents) ─────────

  async getAtlasModels(pipelineType = 'youtube') {
    const ATLAS_API_KEY = process.env.ATLAS_API_KEY || '';
    const categoryMap: Record<string, string[]> = {
      youtube: ['TEXT-TO-VIDEO'],
      instagram: ['TEXT-TO-VIDEO'],
      podcast: ['TEXT-TO-AUDIO'],
      realestate: ['TEXT-TO-VIDEO', 'IMAGE-TO-VIDEO'],
      marketing: ['TEXT-TO-VIDEO', 'TEXT-TO-IMAGE'],
    };
    const categories = categoryMap[pipelineType] || ['TEXT-TO-VIDEO'];
    const autoOption = {
      id: 'auto', name: 'Auto (Recommended)', provider: 'LogicMate', pricePerClip: null,
      desc: 'Best model selected automatically based on quality & cost', tags: [],
    };
    try {
      const response = await axios.get('https://api.atlascloud.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${ATLAS_API_KEY}` }, timeout: 8000,
      });
      const models = (response.data?.data || [])
        .filter((m: any) => m.categories?.some((c: string) => categories.includes(c))
          && m.price?.actual?.base_price && m.display_console === true && m.type === 'Video')
        .map((m: any) => ({
          id: m.model, name: m.displayName, provider: m.organization,
          pricePerClip: parseFloat(m.price.actual.base_price),
          desc: m.profile?.slice(0, 80) || `${m.organization} video model`,
          tags: m.tags || [], logo: m.logo || null,
        }))
        .sort((a: any, b: any) => a.pricePerClip - b.pricePerClip)
        .filter((m: any) => m.id.includes('text-to-video'))
        .slice(0, 8);
      return { models: [autoOption, ...models], source: 'live' };
    } catch (e) {
      console.error(`[AtlasModels] Failed to fetch live models: ${e.message}`);
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

  assertAdmin(role: string) {
    if (role !== 'admin') throw new ForbiddenException('Admins only');
  }
}
