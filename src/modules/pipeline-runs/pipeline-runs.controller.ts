import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
import { PipelineRunsService } from './pipeline-runs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../users/schemas/user.schema';
import { Model } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { PipelineSecretGuard } from '../auth/guards/pipeline-secret.guard';
import { Public } from '../auth/decorators/public.decorator';

  @Controller('pipeline-runs')
  @UseGuards(JwtAuthGuard)
  export class PipelineRunsController {
    constructor(
      private readonly service: PipelineRunsService,
      private readonly emailService: EmailService,
      @InjectModel('User') private userModel: Model<any>,
      private readonly notificationsService: NotificationsService,
    ) {}
  
    // Get active run for current user — used to restore UI after page refresh
    @Get('active')
    getActive(@Req() req: any) {
      return this.service.getActiveRun(req.user._id.toString());
    }
  
    // Get recent runs for current user
    @Get('recent')
    getRecent(@Req() req: any, @Query('limit') limit?: string) {
      return this.service.getRecent(
        req.user._id.toString(),
        limit ? parseInt(limit) : 5
      );
    }
  
    // Get stats
    @Get('stats')
    getStats(@Req() req: any) {
      const isAdmin = req.user.role === 'admin';
      return this.service.getStats(
        isAdmin ? undefined : req.user._id.toString()
      );
    }
  
    // List all runs (admin sees all, user sees own)
    @Get()
    findAll(
      @Req() req: any,
      @Query('moduleType') moduleType?: string,
      @Query('status') status?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      const isAdmin = req.user.role === 'admin';
      return this.service.findAll({
        userId: isAdmin ? undefined : req.user._id.toString(),
        moduleType,
        status,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
      });
    }

    @Get('my')
    async getMyRuns(
      @Req() req: any,
      @Query('page') page = '1',
      @Query('limit') limit = '20',
      @Query('status') status?: string,
    ) {
      return this.service.findAll({
        userId: req.user._id.toString(),
        page: parseInt(page),
        limit: parseInt(limit),
        status,
      });
    }
  
    // Get single run with full logs
    @Get(':runId')
    findOne(@Param('runId') runId: string, @Req() req: any) {
      const isAdmin = req.user.role === 'admin';
      return this.service.findOne(
        runId,
        isAdmin ? undefined : req.user._id.toString()
      );
    }
  
    // Update status — called by Python pipeline
    @Patch(':runId/status')
    @Public()
    @UseGuards(PipelineSecretGuard)
    updateStatus(
      @Param('runId') runId: string,
      @Body() body: {
        status: string;
        currentStep?: number;
        stepLabel?: string;
        errorMessage?: string;
        youtubeUrl?: string;
        title?: string;
        totalCost?: number;
        cost?: number;
      }
    ) {
      if (body.status === 'completed' || body.status === 'complete') {
        return this.service.complete(runId, {
          youtubeUrl: body.youtubeUrl,
          title: body.title,
          totalCost: body.totalCost ?? body.cost,  // ← accept both field names
        });
      }
      if (body.status === 'failed') {
        return this.service.fail(runId, body.errorMessage || 'Unknown error');
      }
      // Handle step progress updates from Python
      if (body.currentStep !== undefined) {
        return this.service.updateStep(runId, body.currentStep, body.status);
      }
      return this.service.updateStatus(runId, body.status as any);
    }

    @Patch(':runId/log')
    @Public()
    @UseGuards(PipelineSecretGuard)  // ← add this line
    appendLog(
      @Param('runId') runId: string,
      @Body() body: { message: string },
    ) {
      return this.service.appendLog(runId, body.message || '');
    }
  
    // Soft delete
    @Delete(':runId')
    softDelete(@Param('runId') runId: string, @Req() req: any) {
      return this.service.softDelete(runId, req.user._id.toString());
    }

    @Post(':runId/notify-complete')
    @Public()
    @UseGuards(PipelineSecretGuard)
    async notifyComplete(
      @Param('runId') runId: string,
      @Body() body: { userId: string; title: string; youtubeUrl: string },
    ) {
      // Return immediately — don't make Python wait
      setImmediate(async () => {
        try {
          const user = await this.userModel.findById(body.userId).lean();
          const run  = await this.service.findByRunId(runId);
          if (user && run) {
            await this.emailService.sendPipelineCompleteEmail(
              { name: (user as any).name, email: (user as any).email },
              {
                title: body.title,
                youtubeUrl: body.youtubeUrl,
                moduleName: (run as any).moduleType || 'YouTube Agent',
                cost: (run as any).totalCost,
              }
            );
            await this.notificationsService.create({
              userId: body.userId,
              type: NotificationType.PIPELINE_COMPLETE,
              title: 'Video uploaded successfully!',
              message: `"${body.title}" is now live on YouTube`,
              actionUrl: body.youtubeUrl,
            });
          }
        } catch (e) {
          console.error(`[notify-complete] ${e.message}`);
        }
      });
      return { ok: true };  // ← return immediately
    }
 
    @Post(':runId/notify-failed')
    @Public()
    @UseGuards(PipelineSecretGuard)
    async notifyFailed(
      @Param('runId') runId: string,
      @Body() body: { userId: string; error: string },
    ) {
      setTimeout(async () => {
        try {
          const user = await this.userModel.findById(body.userId).lean();
          const run  = await this.service.findByRunId(runId);
          if (user) {
            await this.emailService.sendPipelineFailedEmail(
              { name: (user as any).name, email: (user as any).email },
              {
                moduleName: (run as any)?.moduleType || 'YouTube Agent',
                errorMessage: body.error,
              }
            );
            await this.notificationsService.create({
              userId: body.userId,
              type: NotificationType.PIPELINE_FAILED,
              title: 'Pipeline failed',
              message: body.error.slice(0, 100),
            });
          }
        } catch (e) {
          console.error(`[notify-failed] ${e.message}`);
        }
      })
      return { ok: true };
    }
  }