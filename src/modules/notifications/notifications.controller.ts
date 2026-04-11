import {
    Controller, Get, Patch, Delete,
    Param, Query, Req, UseGuards,
  } from '@nestjs/common';
  import { NotificationsService } from './notifications.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('notifications')
  @UseGuards(JwtAuthGuard)
  export class NotificationsController {
    constructor(private notificationsService: NotificationsService) {}
  
    @Get()
    getAll(
      @Req() req: any,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.notificationsService.getUserNotifications(
        req.user._id.toString(),
        page ? parseInt(page) : 1,
        limit ? parseInt(limit) : 20,
      );
    }
  
    @Get('unread-count')
    getUnreadCount(@Req() req: any) {
      return this.notificationsService.getUnreadCount(
        req.user._id.toString(),
      ).then((count) => ({ count }));
    }
  
    @Patch(':id/read')
    markAsRead(@Req() req: any, @Param('id') id: string) {
      return this.notificationsService.markAsRead(
        req.user._id.toString(), id,
      );
    }
  
    @Patch('read-all')
    markAllAsRead(@Req() req: any) {
      return this.notificationsService.markAllAsRead(
        req.user._id.toString(),
      );
    }
  
    @Delete('clear-all')
    clearAll(@Req() req: any) {
      return this.notificationsService.clearAll(req.user._id.toString());
    }
  
    @Delete(':id')
    deleteOne(@Req() req: any, @Param('id') id: string) {
      return this.notificationsService.deleteNotification(
        req.user._id.toString(), id,
      );
    }
  }