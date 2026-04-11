import {
    Controller, Get, Post, Put, Delete,
    Param, Body, Query, Req, UseGuards,
  } from '@nestjs/common';
  import { CmsService } from './cms.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { AdminGuard } from '../auth/guards/admin.guard';
  
  @Controller('cms')
  export class CmsController {
    constructor(private cmsService: CmsService) {}
  
    // ─── Public routes ───────────────────────────────────────────
  
    @Get('pages/:slug')
    getPage(@Param('slug') slug: string) {
      return this.cmsService.getPage(slug);
    }
  
    @Get('blog')
    getBlogPosts(
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Query('category') category?: string,
      @Query('tag') tag?: string,
    ) {
      return this.cmsService.getBlogPosts({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 9,
        category,
        tag,
      });
    }
  
    @Get('blog/:slug')
    getBlogPost(@Param('slug') slug: string) {
      return this.cmsService.getBlogPost(slug);
    }
  
    // ─── Admin routes ────────────────────────────────────────────
  
    @Post('seed')
    @UseGuards(JwtAuthGuard, AdminGuard)
    seedPages() {
      return this.cmsService.seedPages();
    }
  
    @Get('admin/pages/:slug')
    @UseGuards(JwtAuthGuard, AdminGuard)
    getPageAdmin(@Param('slug') slug: string) {
      return this.cmsService.getPageAdmin(slug);
    }
  
    @Put('admin/pages/:slug')
    @UseGuards(JwtAuthGuard, AdminGuard)
    updatePage(
      @Param('slug') slug: string,
      @Body() dto: any,
      @Req() req: any,
    ) {
      return this.cmsService.updatePage(
        slug,
        dto,
        req.user?.name || 'Admin',
      );
    }
  
    @Get('admin/blog')
    @UseGuards(JwtAuthGuard, AdminGuard)
    getAllBlogPostsAdmin(
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.cmsService.getAllBlogPostsAdmin({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      });
    }
  
    @Post('admin/blog')
    @UseGuards(JwtAuthGuard, AdminGuard)
    createBlogPost(@Body() dto: any, @Req() req: any) {
      return this.cmsService.createBlogPost(
        dto,
        req.user._id.toString(),
        req.user.name,
      );
    }
  
    @Put('admin/blog/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    updateBlogPost(@Param('id') id: string, @Body() dto: any) {
      return this.cmsService.updateBlogPost(id, dto);
    }
  
    @Delete('admin/blog/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    deleteBlogPost(@Param('id') id: string) {
      return this.cmsService.deleteBlogPost(id);
    }
}