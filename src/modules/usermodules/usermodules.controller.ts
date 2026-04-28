import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { UserModulesService } from './usermodules.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('usermodules')
  @UseGuards(JwtAuthGuard)
  export class UserModulesController {
    constructor(private readonly service: UserModulesService) {}
  
    // ── Subscribe to a module ─────────────────────────────────
    @Post('subscribe')
    subscribe(@Req() req: any, @Body() body: {
      moduleId: string;
      moduleName: string;
      moduleType: string;
      pipelineType: string;
      name?: string;
      config?: Record<string, any>;
      niche?: string;
      apiKeyMode?: string;
    }) {
      return this.service.subscribe({
        userId: req.user._id.toString(),
        moduleId: body.moduleId,
        moduleName: body.moduleName,
        moduleType: body.moduleType,
        pipelineType: body.pipelineType,
        name: body.name || body.moduleName,
        config: body.config,
        niche: body.niche,
        apiKeyMode: body.apiKeyMode,
      });
    }
  
    // ── Get current user's modules ────────────────────────────
    @Get('my')
    getMyModules(
      @Req() req: any,
      @Query('moduleType') moduleType?: string,
      @Query('status') status?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.service.findByUser(req.user._id.toString(), {
        moduleType, status,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      });
    }
  
    // ── Billing summary ───────────────────────────────────────
    @Get('billing-summary')
    getBillingSummary(@Req() req: any) {
      return this.service.getBillingSummary(req.user._id.toString());
    }
  
    // ── Admin: get all user modules ───────────────────────────
    @Get()
    findAll(
      @Req() req: any,
      @Query('userId') userId?: string,
      @Query('moduleType') moduleType?: string,
      @Query('status') status?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      if (req.user.role !== 'admin') {
        return this.service.findByUser(req.user._id.toString(), {
          moduleType, status,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 20,
        });
      }
      return this.service.findAll({
        userId, moduleType, status,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
      });
    }
  
    // ── Get single ────────────────────────────────────────────
    @Get(':id')
    findOne(@Req() req: any, @Param('id') id: string) {
      return this.service.findOne(id, req.user._id.toString());
    }
  
    // ── Update ────────────────────────────────────────────────
    @Patch(':id')
    update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
      return this.service.update(id, req.user._id.toString(), body);
    }
  
    // ── Toggle active/paused ─────────────────────────────────
    @Patch(':id/toggle')
    toggle(@Req() req: any, @Param('id') id: string) {
      return this.service.toggle(id, req.user._id.toString());
    }
  
    // ── Cancel / soft delete ──────────────────────────────────
    @Delete(':id')
    softDelete(@Req() req: any, @Param('id') id: string) {
      return this.service.softDelete(id, req.user._id.toString());
    }
  
    // ── Admin: extend trial ───────────────────────────────────
    @Patch(':id/extend-trial')
    extendTrial(@Req() req: any, @Param('id') id: string, @Body() body: { days: number }) {
      if (req.user.role !== 'admin') return { message: 'Forbidden' };
      return this.service.extendTrial(id, body.days, req.user._id.toString());
    }
  
    // ── Admin: free forever ───────────────────────────────────
    @Patch(':id/free-forever')
    grantFreeForever(@Req() req: any, @Param('id') id: string) {
      if (req.user.role !== 'admin') return { message: 'Forbidden' };
      return this.service.grantFreeForever(id, req.user._id.toString());
    }
  }