import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  ContentIdea,
  ContentIdeaDocument,
  ContentIdeaStatus,
} from './schemas/content-idea.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContentIdeasService {
  private readonly logger = new Logger(ContentIdeasService.name);

  constructor(
    @InjectModel(ContentIdea.name)
    private ideaModel: Model<ContentIdeaDocument>,
    private config: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  private get pythonUrl(): string {
    return this.config.get('PYTHON_SERVICE_URL') || 'http://localhost:8001';
  }

  async generateIdea(userId: string, agentId: string, topic: string, trendId?: string) {
    this.logger.log(`Generating content idea for topic: ${topic}`);

    // Call Python service to generate script + metadata
    const response = await fetch(`${this.pythonUrl}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        niche: 'dark psychology and human behavior',
        agent_id: agentId,
      }),
    });

    const data = await response.json() as any;

    const idea = await this.ideaModel.create({
      agentId: new Types.ObjectId(agentId),
      userId: new Types.ObjectId(userId),
      trendId: trendId ? new Types.ObjectId(trendId) : undefined,
      topic,
      title: data.title,
      script: data.script,
      description: data.description,
      tags: data.tags,
      seoKeywords: data.seo_keywords,
      thumbnailPrompt: data.thumbnail_prompt,
      status: ContentIdeaStatus.SCRIPT_READY,
    });

    return idea;
  }

  async getIdeas(userId: string, agentId?: string) {
    try {
      // Validate userId before converting
      if (!userId || !Types.ObjectId.isValid(userId)) {
        return [];
      }
  
      const filter: any = {
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      };
  
      if (agentId && Types.ObjectId.isValid(agentId)) {
        filter.agentId = new Types.ObjectId(agentId);
      }
  
      return await this.ideaModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    } catch (err) {
      console.error('getIdeas error:', err);
      return [];
    }
  }

  async getIdeaById(userId: string, ideaId: string) {
    const idea = await this.ideaModel.findOne({
      _id: new Types.ObjectId(ideaId),
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    });
    if (!idea) throw new NotFoundException('Content idea not found');
    return idea;
  }

  async updateStatus(ideaId: string, status: ContentIdeaStatus, extra?: Partial<ContentIdea>) {
    // First fetch the idea so we have userId and title for notifications
    const idea = await this.ideaModel.findById(ideaId).lean();
  
    // Update the status
    const updated = await this.ideaModel.findByIdAndUpdate(
      ideaId,
      { status, ...extra },
      { new: true },
    );
  
    // Fire notification based on status
    if (idea?.userId) {
      const userId = idea.userId.toString();
  
      if (status === ContentIdeaStatus.UPLOADED) {
        await this.notificationsService.onPipelineComplete(
          userId,
          idea.title,
          (extra as any)?.youtubeUrl || '',
          (extra as any)?.totalPipelineMinutes || 0,
          1.32,
        ).catch(() => {}); // Non-critical — don't throw
      } else if (status === ContentIdeaStatus.FAILED) {
        await this.notificationsService.onPipelineFailed(
          userId,
          idea.title,
          (extra as any)?.error || 'Unknown error',
          'Pipeline execution',
        ).catch(() => {}); // Non-critical — don't throw
      }
    }
  
    return updated;
  }

  async triggerFullPipeline(userId: string, ideaId: string) {
    const idea = await this.getIdeaById(userId, ideaId);

    this.logger.log(`Triggering full pipeline for idea: ${idea.title}`);

    // Fire and forget — Python service handles the rest async
    fetch(`${this.pythonUrl}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea_id: ideaId,
        title: idea.title,
        script: idea.script,
        description: idea.description,
        tags: idea.tags,
        seo_keywords: idea.seoKeywords,
        thumbnail_prompt: idea.thumbnailPrompt,
        agent_id: idea.agentId.toString(),
        user_id: userId,
      }),
    }).catch(err => this.logger.error('Pipeline trigger failed:', err.message));

    await this.updateStatus(ideaId, ContentIdeaStatus.VIDEO_QUEUED);

    return { message: 'Pipeline started', ideaId, status: 'video_queued' };
  }

  async softDelete(userId: string, ideaId: string) {
    const idea = await this.ideaModel.findOneAndUpdate(
      { _id: new Types.ObjectId(ideaId), userId: new Types.ObjectId(userId) },
      { isDeleted: true },
      { new: true },
    );
    if (!idea) throw new NotFoundException('Idea not found');
    return { message: 'Idea deleted' };
  }

  async getRecentIdeas(userId: string) {
    try {
      if (!userId || !Types.ObjectId.isValid(userId)) {
        return [];
      }
  
      return await this.ideaModel
        .find({
          userId: new Types.ObjectId(userId),
          isDeleted: false,
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title status youtubeUrl createdAt scheduledUploadTime topic agentId')
        .lean();
    } catch (err) {
      console.error('getRecentIdeas error:', err);
      return [];
    }
  }
  
  async getOne(ideaId: string, userId: string) {
    if (!ideaId || !Types.ObjectId.isValid(ideaId)) {
      throw new NotFoundException('Invalid idea ID');
    }
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }
  
    const idea = await this.ideaModel
      .findOne({
        _id: new Types.ObjectId(ideaId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .lean();
  
    if (!idea) {
      throw new NotFoundException('Content idea not found');
    }
  
    return idea;
  }

  async triggerPipeline(ideaId: string, userId: string, res: any) {
    if (!Types.ObjectId.isValid(ideaId)) {
      throw new NotFoundException('Content idea not found');
    }
  
    const idea = await this.ideaModel.findOne({
      _id: new Types.ObjectId(ideaId),
      userId: new Types.ObjectId(userId),
    });
  
    if (!idea) throw new NotFoundException('Content idea not found');
    if (!idea.outputFolderPath) {
      throw new BadRequestException('No output folder path on this idea');
    }
  
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
  
    try {
      const response = await fetch(`${pythonUrl}/pipeline/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_path: idea.outputFolderPath,
          idea_id: ideaId,
          is_first_video: false,
        }),
      });
  
      const data = await response.json() as { run_id: string; status: string };
      return { runId: data.run_id, status: data.status };
    } catch (err) {
      throw new BadRequestException('Failed to trigger pipeline — is Python service running?');
    }
  }
  
  async streamPipelineLogs(runId: string, res: any) {
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
  
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  
    try {
      const response = await fetch(`${pythonUrl}/pipeline/logs/${runId}`);
      const reader = response.body?.getReader();
      if (!reader) {
        res.end();
        return;
      }
  
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
    } catch {
      res.write('data: __PIPELINE_FAILED__: Connection error\n\n');
    }
  
    res.end();
  }

  async runFullPipeline(userId: string, agentId: string, niche?: string, dryRun = false) {
    const pythonUrl = this.pythonUrl; // use instance getter
  
    // Get user details — query userModel directly via ideaModel's db connection
    let userName = 'Unknown user';
    let userEmail = '';
    try {
      const UserModel = this.ideaModel.db.model('User');
      const user = await UserModel.findById(userId).select('name email').lean();
      if (user) {
        userName = (user as any).name || 'Unknown user';
        userEmail = (user as any).email || '';
      }
    } catch {}
  
    try {
      await this.notificationsService.onPipelineStarted(
        userId,
        'New video pipeline',
        niche || 'dark psychology',
      );
  
      const response = await fetch(`${pythonUrl}/pipeline/run-from-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche || 'dark psychology and human behavior',
          agent_id: agentId,
          dry_run: dryRun,
          user_name: userName,
          user_email: userEmail,
          user_id: userId,
        }),
      });
  
      const data = await response.json() as { run_id: string; status: string };
      return { runId: data.run_id, status: data.status };
    } catch {
      throw new BadRequestException(
        'Failed to start pipeline — is Python service running on port 8001?'
      );
    }
  }
}