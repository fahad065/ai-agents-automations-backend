import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { NichesService } from './niches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('niches')
export class NichesController {
  constructor(private readonly service: NichesService) {}

  // Public — list niches filtered by country
  @Get()
  findAll(@Query('country') country?: string) {
    return this.service.findAll(country);
  }

  // Admin — create niche
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.service.create(body);
  }

  // Admin — update niche
  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  async update(@Req() req: any, @Param('slug') slug: string, @Body() body: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    const result = await this.service.update(slug, body);
    if (!result) return { message: 'Niche not found' };
    return result;
  }
}
