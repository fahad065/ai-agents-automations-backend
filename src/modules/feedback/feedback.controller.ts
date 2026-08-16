import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { FeedbackService } from './feedback.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('feedback')
  export class FeedbackController {
    constructor(private readonly service: FeedbackService) {}
  
    // Public — get approved feedback for website
    @Get('public')
    getPublic(
      @Query('moduleId') moduleId?: string,
      @Query('limit') limit?: string,
    ) {
      return this.service.getPublic(moduleId, limit ? parseInt(limit) : 10);
    }
  
    // Submit feedback (authenticated)
    @Post()
    @UseGuards(JwtAuthGuard)
    create(@Req() req: any, @Body() body: {
      moduleId?: string;
      moduleType?: string;
      moduleName?: string;
      rating: number;
      text: string;
    }) {
      const user = req.user;
      return this.service.create({
        userId: user._id.toString(),
        userName: user.name,
        userAvatar: user.avatar,
        ...body,
      });
    }
  
    // Admin: get all feedback with filters
    @Get()
    @UseGuards(JwtAuthGuard)
    findAll(
      @Query('isApproved') isApproved?: string,
      @Query('moduleType') moduleType?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.service.findAll({
        isApproved: isApproved !== undefined ? isApproved === 'true' : undefined,
        moduleType,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
      });
    }
  
    // Admin: approve feedback
    @Patch(':id/approve')
    @UseGuards(JwtAuthGuard)
    approve(@Param('id') id: string, @Req() req: any) {
      return this.service.approve(id, req.user._id.toString());
    }
  
    // Admin: soft delete
    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    softDelete(@Param('id') id: string) {
      return this.service.softDelete(id);
    }
  }