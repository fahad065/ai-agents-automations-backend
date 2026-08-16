import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { IndustrySubscriptionsService } from './industry-subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('industry-subscriptions')
@UseGuards(JwtAuthGuard)
export class IndustrySubscriptionsController {
  constructor(private readonly service: IndustrySubscriptionsService) {}

  // Subscribe to an industry
  @Post()
  subscribe(
    @Req() req: any,
    @Body('industrySlug') industrySlug: string,
    @Body('planType') planType = 'free_trial',
    @Body('country') country = 'UAE',
  ) {
    return this.service.subscribe(req.user.userId, industrySlug, country, planType);
  }

  // Get all my subscriptions
  @Get()
  getMySubscriptions(@Req() req: any, @Query('lang') lang = 'en') {
    return this.service.getUserSubscriptions(req.user.userId, lang);
  }

  // Get single subscription by industry slug
  @Get(':slug')
  getOne(@Req() req: any, @Param('slug') slug: string) {
    return this.service.getSubscription(req.user.userId, slug);
  }

  // Add extra modules to subscription
  @Patch(':slug/modules/add')
  addModules(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body('moduleIds') moduleIds: string[],
  ) {
    return this.service.addModules(req.user.userId, slug, moduleIds);
  }

  // Remove added module from subscription
  @Delete(':slug/modules/:moduleId')
  removeModule(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('moduleId') moduleId: string,
  ) {
    return this.service.removeModule(req.user.userId, slug, moduleId);
  }

  // Setup wizard: save API keys for a specific module
  @Patch(':slug/setup/api-keys/:moduleId')
  saveApiKeys(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('moduleId') moduleId: string,
    @Body('apiKeys') apiKeys: Record<string, string>,
  ) {
    return this.service.saveApiKeys(req.user.userId, slug, moduleId, apiKeys);
  }

  // Setup wizard: update current step
  @Patch(':slug/setup/step')
  updateStep(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body('step') step: number,
    @Body('complete') complete = false,
  ) {
    return this.service.updateSetupStep(req.user.userId, slug, step, complete);
  }

  // Save per-module config (schedule, custom name, etc.)
  @Patch(':slug/config/:moduleId')
  saveConfig(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('moduleId') moduleId: string,
    @Body() config: Record<string, any>,
  ) {
    return this.service.saveModuleConfig(req.user.userId, slug, moduleId, config);
  }

  // Cancel subscription
  @Delete(':slug')
  cancel(@Req() req: any, @Param('slug') slug: string) {
    return this.service.cancel(req.user.userId, slug);
  }

  // Admin — get all subscriptions
  @Get('admin/all')
  adminAll(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('industrySlug') industrySlug?: string,
  ) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.service.adminGetAll({ status, industrySlug });
  }
}
