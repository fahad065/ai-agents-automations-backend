import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const toInt = (v?: string, fallback = 1) => (v ? parseInt(v, 10) : fallback);

@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  // ── Public ────────────────────────────────────────────────

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('country') country?: string,
    @Query('nicheSlug') nicheSlug?: string,
    @Query('pipelineCategory') pipelineCategory?: string,
    @Query('lang') lang = 'en',
  ) {
    return this.service.findAll({
      type, category, search, country, nicheSlug, pipelineCategory, lang,
      publicOnly: true,
      page: toInt(page),
      limit: toInt(limit, 20),
    });
  }

  // Declared before ':idOrSlug' so it's never read as a slug.
  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  findAllAdmin(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.service.findAll({
      type, category, search,
      page: toInt(page),
      limit: toInt(limit, 20),
    });
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.service.findOne(idOrSlug);
  }

  // ── Admin ─────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.service.create(body);
  }

  @Patch(':idOrSlug')
  @UseGuards(JwtAuthGuard)
  update(@Req() req: any, @Param('idOrSlug') idOrSlug: string, @Body() body: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.service.update(idOrSlug, body);
  }

  @Delete(':idOrSlug')
  @UseGuards(JwtAuthGuard)
  softDelete(@Req() req: any, @Param('idOrSlug') idOrSlug: string) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.service.softDelete(idOrSlug);
  }
}
