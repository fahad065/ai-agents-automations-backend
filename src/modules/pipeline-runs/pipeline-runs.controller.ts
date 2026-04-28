import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { PipelineRunsService } from './pipeline-runs.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('pipeline-runs')
  @UseGuards(JwtAuthGuard)
  export class PipelineRunsController {
    constructor(private readonly service: PipelineRunsService) {}
  
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
    updateStatus(
      @Param('runId') runId: string,
      @Body() body: { status: string; errorMessage?: string; youtubeUrl?: string; totalCost?: number }
    ) {
      if (body.status === 'complete') {
        return this.service.complete(runId, {
          youtubeUrl: body.youtubeUrl,
          totalCost: body.totalCost,
        });
      }
      if (body.status === 'failed') {
        return this.service.fail(runId, body.errorMessage || 'Unknown error');
      }
      return this.service.updateStatus(runId, body.status as any);
    }
  
    // Soft delete
    @Delete(':runId')
    softDelete(@Param('runId') runId: string, @Req() req: any) {
      return this.service.softDelete(runId, req.user._id.toString());
    }
  }