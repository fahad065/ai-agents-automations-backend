import {
  Controller, Get, Post, Delete, Patch,
  Body, Param, Req, Res, UseGuards, Query
} from '@nestjs/common';
import { ContentIdeasService } from './content-ideas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';

@Controller('content-ideas')
@UseGuards(JwtAuthGuard)
export class ContentIdeasController {
  constructor(private contentIdeasService: ContentIdeasService) {}

  @Post('generate')
  generate(@Req() req: any, @Body() body: any) {
    return this.contentIdeasService.generateIdea(
      req.user._id.toString(),
      body.agentId,
      body.topic,
      body.trendId,
    );
  }

  @Get('recent')
  getRecent(@Req() req: any) {
    return this.contentIdeasService.getRecentIdeas(req.user._id.toString());
  }

  @Post('run-full')
  async runFull(@Req() req: any, @Body() body: any) {
    return this.contentIdeasService.runFullPipeline(
      req.user._id.toString(),
      body.agentId,
      body.niche,
    );
  }

  @Get('pipeline-run/:runId/logs')
  streamLogs(@Param('runId') runId: string, @Res() res: any) {
    return this.contentIdeasService.streamPipelineLogs(runId, res);
  }

  @Get()
  findAll(@Req() req: any, @Query('agentId') agentId?: string) {
    return this.contentIdeasService.getIdeas(req.user._id.toString(), agentId);
  }

  @Get('idea/:ideaId')
  findOne(@Req() req: any, @Param('ideaId') ideaId: string) {
    return this.contentIdeasService.getIdeaById(
      req.user._id.toString(), ideaId,
    );
  }

  @Post(':ideaId/pipeline')
  runPipeline(@Req() req: any, @Param('ideaId') ideaId: string) {
    return this.contentIdeasService.triggerFullPipeline(
      req.user._id.toString(), ideaId,
    );
  }

  @Post(':id/trigger-pipeline')
  async triggerPipeline(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    return this.contentIdeasService.triggerPipeline(
      id,
      req.user._id.toString(),
      res,
    );
  }

  @Patch(':ideaId/status')
  updateStatus(@Param('ideaId') ideaId: string, @Body() body: any) {
    return this.contentIdeasService.updateStatus(ideaId, body.status, body);
  }

  @Get('pipeline/:ideaId/stream')
  async streamPipelineStatus(
    @Param('ideaId') ideaId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const idea = await this.contentIdeasService.getIdeaById(
      req.user._id.toString(), ideaId,
    );
    sendEvent({ status: idea.status, ideaId });

    const interval = setInterval(async () => {
      try {
        const updated = await this.contentIdeasService.getIdeaById(
          req.user._id.toString(), ideaId,
        );
        sendEvent({ status: updated.status, ideaId, idea: updated });

        if (['uploaded', 'failed'].includes(updated.status)) {
          clearInterval(interval);
          res.end();
        }
      } catch {
        clearInterval(interval);
        res.end();
      }
    }, 3000);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }

  @Delete(':ideaId')
  remove(@Req() req: any, @Param('ideaId') ideaId: string) {
    return this.contentIdeasService.softDelete(
      req.user._id.toString(), ideaId,
    );
  }
}