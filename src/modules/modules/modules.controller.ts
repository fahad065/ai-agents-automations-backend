import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { ModulesService } from './modules.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('modules')
  export class ModulesController {
    constructor(private readonly service: ModulesService) {}
  
    // ── Public routes ─────────────────────────────────────────
  
    @Get()
    findAll(
      @Query('moduleType') moduleType?: string,
      @Query('category') category?: string,
      @Query('search') search?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.service.findAll({
        moduleType,
        category,
        isActive: true,
        search,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      });
    }

    @Get('public/stats')
    async getPublicStats() {
        return this.service.getPublicStats();
    }
  
    @Get(':idOrSlug')
    findOne(@Param('idOrSlug') idOrSlug: string) {
      return this.service.findOne(idOrSlug);
    }
  
    // ── Admin routes ──────────────────────────────────────────
  
    @Post()
    @UseGuards(JwtAuthGuard)
    create(@Req() req: any, @Body() body: any) {
      if (req.user.role !== 'admin') return { message: 'Forbidden' };
      return this.service.create(body);
    }
  
    @Patch(':idOrSlug')
    @UseGuards(JwtAuthGuard)
    update(
      @Req() req: any,
      @Param('idOrSlug') idOrSlug: string,
      @Body() body: any,
    ) {
      if (req.user.role !== 'admin') return { message: 'Forbidden' };
      return this.service.update(idOrSlug, body);
    }
  
    @Delete(':idOrSlug')
    @UseGuards(JwtAuthGuard)
    softDelete(@Req() req: any, @Param('idOrSlug') idOrSlug: string) {
      if (req.user.role !== 'admin') return { message: 'Forbidden' };
      return this.service.softDelete(idOrSlug);
    }
  
    // ── Admin — all modules including inactive ────────────────
  
    @Get('admin/all')
    @UseGuards(JwtAuthGuard)
    findAllAdmin(
      @Req() req: any,
      @Query('moduleType') moduleType?: string,
      @Query('category') category?: string,
      @Query('search') search?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      if (req.user.role !== 'admin') return { data: [], total: 0 };
      return this.service.findAll({
        moduleType,
        category,
        search,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        includeDeleted: false,
      });
    }
  }