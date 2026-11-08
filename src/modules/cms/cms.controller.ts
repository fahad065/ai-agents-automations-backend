import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { CmsService } from './cms.service';
import { CmsType } from './schemas/cms.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

// One unified controller over the `cms` collection — no more separate
// "pages" and "blog" route groups named after the old split collections.
// `type` ('page' | 'blog') is just a filter/discriminator on one resource.
@Controller('cms')
export class CmsController {
  constructor(private cmsService: CmsService) {}

  // ─── Public ──────────────────────────────────────────────────

  @Get('content')
  list(
    @Query('type') type: CmsType,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cmsService.listPublic({
      type,
      category,
      tag,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 9,
    });
  }

  @Get('content/:type/:slug')
  getOne(@Param('type') type: CmsType, @Param('slug') slug: string) {
    return this.cmsService.getPublic(type, slug);
  }

  // ─── Admin ───────────────────────────────────────────────────

  @Get('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminList(
    @Query('type') type?: CmsType,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cmsService.adminList({
      type,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminGet(@Param('id') id: string) {
    return this.cmsService.adminGet(id);
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminCreate(@Body() dto: any, @Req() req: any) {
    return this.cmsService.adminCreate(dto, { _id: req.user._id, name: req.user.name });
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminUpdate(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    return this.cmsService.adminUpdate(id, dto, { name: req.user?.name || 'Admin' });
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminDelete(@Param('id') id: string) {
    return this.cmsService.adminDelete(id);
  }

  @Post('admin/seed')
  @UseGuards(JwtAuthGuard, AdminGuard)
  seed() {
    return this.cmsService.seed();
  }
}
