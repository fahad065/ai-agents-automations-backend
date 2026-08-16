import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { IndustriesService } from './industries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('industries')
export class IndustriesController {
  constructor(private readonly service: IndustriesService) {}

  @Get()
  findAll(
    @Query('country') country?: string,
    @Query('lang') lang = 'en',
  ) {
    return this.service.findAll(country, lang);
  }

  @Get(':slug')
  findOne(
    @Param('slug') slug: string,
    @Query('lang') lang = 'en',
  ) {
    return this.service.findBySlug(slug, lang);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.service.create(body);
  }

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  async update(@Req() req: any, @Param('slug') slug: string, @Body() body: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    const result = await this.service.update(slug, body);
    if (!result) return { message: 'Industry not found' };
    return result;
  }

  // Admin — set which modules are included by default in an industry bundle
  @Patch(':slug/default-modules')
  @UseGuards(JwtAuthGuard)
  async setDefaultModules(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body('moduleIds') moduleIds: string[],
  ) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    const result = await this.service.setDefaultModules(slug, moduleIds);
    if (!result) return { message: 'Industry not found' };
    return result;
  }
}
