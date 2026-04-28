import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PipelineRun, PipelineRunDocument, PipelineRunStatus } from './schemas/pipeline-run.schema';

@Injectable()
export class PipelineRunsService {
  constructor(
    @InjectModel(PipelineRun.name)
    private runModel: Model<PipelineRunDocument>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(data: {
    userId: string;
    agentId?: string;
    moduleType?: string;
    runId: string;
    niche?: string;
    folderPath?: string;
  }): Promise<PipelineRunDocument> {
    const run = await this.runModel.create({
      userId: new Types.ObjectId(data.userId),
      agentId: data.agentId ? new Types.ObjectId(data.agentId) : undefined,
      moduleType: data.moduleType || 'youtube',
      runId: data.runId,
      status: PipelineRunStatus.RUNNING,
      niche: data.niche,
      folderPath: data.folderPath,
      startedAt: new Date(),
    });
    return run;
  }

  // ── Get active run for user (for UI restore after page refresh) ───────────

  async getActiveRun(userId: string): Promise<PipelineRunDocument | null> {
    return this.runModel.findOne({
      userId: new Types.ObjectId(userId),
      status: PipelineRunStatus.RUNNING,
      isDeleted: false,
    }).sort({ createdAt: -1 }).lean() as any;
  }

  // ── Get active run for agent ──────────────────────────────────────────────

  async getActiveRunForAgent(agentId: string): Promise<PipelineRunDocument | null> {
    return this.runModel.findOne({
      agentId: new Types.ObjectId(agentId),
      status: PipelineRunStatus.RUNNING,
      isDeleted: false,
    }).sort({ createdAt: -1 }).lean() as any;
  }

  // ── Update step ───────────────────────────────────────────────────────────

  async updateStep(runId: string, step: number, status?: string): Promise<void> {
    await this.runModel.findOneAndUpdate(
      { runId },
      {
        currentStep: step,
        ...(status && { status }),
      }
    );
  }

  // ── Update status ─────────────────────────────────────────────────────────

  async updateStatus(
    runId: string,
    status: PipelineRunStatus,
    extra?: Partial<PipelineRun>
  ): Promise<void> {
    const update: any = { status, ...extra };

    if (status === PipelineRunStatus.COMPLETE) {
      update.completedAt = new Date();
    }

    await this.runModel.findOneAndUpdate({ runId }, update);
  }

  // ── Append log ────────────────────────────────────────────────────────────

  async appendLog(runId: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.runModel.findOneAndUpdate(
      { runId },
      {
        $push: {
          logs: {
            $each: [`[${timestamp}] ${message}`],
            $slice: -500, // Keep last 500 logs only
          }
        }
      }
    );
  }

  // ── Update folder path (set when folder is created) ──────────────────────

  async setFolderPath(runId: string, folderPath: string): Promise<void> {
    await this.runModel.findOneAndUpdate({ runId }, { folderPath });
  }

  // ── Update clips count (for resume without rebilling) ────────────────────

  async updateClips(runId: string, count: number, paths: string[]): Promise<void> {
    await this.runModel.findOneAndUpdate(
      { runId },
      { clipsGenerated: count, clipPaths: paths }
    );
  }

  // ── Complete run ──────────────────────────────────────────────────────────

  async complete(runId: string, data: {
    youtubeUrl?: string;
    shortsUrls?: string[];
    totalCost?: number;
    title?: string;
  }): Promise<void> {
    await this.runModel.findOneAndUpdate(
      { runId },
      {
        status: PipelineRunStatus.COMPLETE,
        completedAt: new Date(),
        ...data,
      }
    );
  }

  // ── Fail run ──────────────────────────────────────────────────────────────

  async fail(runId: string, errorMessage: string): Promise<void> {
    await this.runModel.findOneAndUpdate(
      { runId },
      {
        status: PipelineRunStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      }
    );
  }

  // ── List runs (admin sees all, user sees own) ─────────────────────────────

  async findAll(options: {
    userId?: string;
    moduleType?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, moduleType, status, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const filter: any = { isDeleted: false };
    if (userId) filter.userId = new Types.ObjectId(userId);
    if (moduleType) filter.moduleType = moduleType;
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      this.runModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-logs -clipPaths') // exclude large fields from list
        .lean(),
      this.runModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ── Get single run with logs ──────────────────────────────────────────────

  async findOne(runId: string, userId?: string): Promise<PipelineRunDocument> {
    const filter: any = { runId, isDeleted: false };
    if (userId) filter.userId = new Types.ObjectId(userId);

    const run = await this.runModel.findOne(filter).lean();
    if (!run) throw new NotFoundException('Pipeline run not found');
    return run as any;
  }

  // ── Soft delete ───────────────────────────────────────────────────────────

  async softDelete(runId: string, userId: string): Promise<void> {
    await this.runModel.findOneAndUpdate(
      { runId, userId: new Types.ObjectId(userId) },
      { isDeleted: true }
    );
  }

  // ── Get recent runs for user ──────────────────────────────────────────────

  async getRecent(userId: string, limit = 5): Promise<PipelineRunDocument[]> {
    return this.runModel
      .find({
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('runId status moduleType title youtubeUrl totalCost startedAt completedAt currentStep totalSteps')
      .lean() as any;
  }

  // ── Stats for dashboard ───────────────────────────────────────────────────

  async getStats(userId?: string) {
    const filter: any = { isDeleted: false };
    if (userId) filter.userId = new Types.ObjectId(userId);

    const [total, complete, failed, running] = await Promise.all([
      this.runModel.countDocuments(filter),
      this.runModel.countDocuments({ ...filter, status: PipelineRunStatus.COMPLETE }),
      this.runModel.countDocuments({ ...filter, status: PipelineRunStatus.FAILED }),
      this.runModel.countDocuments({ ...filter, status: PipelineRunStatus.RUNNING }),
    ]);

    const costAgg = await this.runModel.aggregate([
      { $match: { ...filter, status: PipelineRunStatus.COMPLETE } },
      { $group: { _id: null, totalCost: { $sum: '$totalCost' } } },
    ]);

    return {
      total,
      complete,
      failed,
      running,
      totalCost: costAgg[0]?.totalCost || 0,
      successRate: total > 0 ? Math.round((complete / total) * 100) : 0,
    };
  }
}