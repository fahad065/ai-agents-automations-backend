import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PipelineSecretGuard } from '../auth/guards/pipeline-secret.guard';
import { Public } from '../auth/decorators/public.decorator';
import { PipelineServicesService } from './pipeline-services.service';

// Agents/automations a customer owns (userservices, type agent|automation).
// Chatbots keep their own /chatbots routes.
// 'usermodules' is a temporary alias so a Python service deployed before
// 2026-11-17 can still call /usermodules/:id/record-run — remove it once the
// Python service is redeployed (core/nestjs_client.py now calls /userservices).
@Controller(['userservices', 'usermodules'])
@UseGuards(JwtAuthGuard)
export class PipelineServicesController {
  constructor(private readonly service: PipelineServicesService) {}

  @Post('subscribe')
  subscribe(@Req() req: any, @Body() body: any) {
    return this.service.subscribe(req.user._id.toString(), body);
  }

  @Get('my')
  my(@Req() req: any, @Query('moduleType') moduleType?: string, @Query('status') status?: string,
    @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.findByUser(req.user._id.toString(), {
      moduleType, status, page: page ? parseInt(page) : 1, limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('billing-summary')
  billingSummary(@Req() req: any) {
    return this.service.getBillingSummary(req.user._id.toString());
  }

  // Admin: everyone's services. A customer gets their own.
  @Get()
  findAll(@Req() req: any, @Query('userId') userId?: string, @Query('moduleType') moduleType?: string,
    @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const opts = { moduleType, status, page: page ? parseInt(page) : 1 };
    if (req.user.role !== 'admin') {
      return this.service.findByUser(req.user._id.toString(), { ...opts, limit: limit ? parseInt(limit) : 20 });
    }
    return this.service.findAll({ ...opts, userId, limit: limit ? parseInt(limit) : 10 });
  }

  @Get('atlas-models')
  atlasModels(@Query('type') type?: string) {
    return this.service.getAtlasModels(type || 'youtube');
  }

  @Patch(':id/record-run')
  @Public()
  @UseGuards(PipelineSecretGuard)
  recordRun(@Param('id') id: string, @Body() body: { cost: number }) {
    return this.service.recordRun(id, body.cost || 0);
  }

  @Post('cron/trigger')
  async cronTrigger(@Body() body: { secret: string }) {
    const cronSecret = process.env.CRON_SECRET || 'logicmate-cron-secret';
    if (body.secret !== cronSecret) throw new UnauthorizedException('Invalid cron secret');
    return this.service.runScheduledServices();
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(id, req.user._id.toString());
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.update(id, req.user._id.toString(), body);
  }

  @Patch(':id/toggle')
  toggle(@Req() req: any, @Param('id') id: string) {
    return this.service.toggle(id, req.user._id.toString());
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.softDelete(id, req.user._id.toString());
  }

  @Patch(':id/extend-trial')
  extendTrial(@Req() req: any, @Param('id') id: string, @Body() body: { days: number }) {
    this.service.assertAdmin(req.user.role);
    return this.service.extendTrial(id, body.days);
  }

  @Patch(':id/free-forever')
  freeForever(@Req() req: any, @Param('id') id: string) {
    this.service.assertAdmin(req.user.role);
    return this.service.grantFreeForever(id);
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string) {
    return this.service.runPipeline(id, req.user._id.toString());
  }

  @Get(':id/run-status')
  runStatus(@Req() req: any, @Param('id') id: string) {
    return this.service.getLatestRunStatus(id, req.user._id.toString());
  }

  @Patch(':id/schedule')
  schedule(@Req() req: any, @Param('id') id: string, @Body() body: { scheduleFrequency: string; scheduleTime: string; scheduleDays?: string[] }) {
    return this.service.update(id, req.user._id.toString(), body);
  }

  @Patch(':id/prompt')
  prompt(@Req() req: any, @Param('id') id: string, @Body() body: { customPrompt?: string; useCustomPrompt: boolean; niche?: string }) {
    return this.service.update(id, req.user._id.toString(), body);
  }
}
