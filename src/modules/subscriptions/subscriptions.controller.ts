import {
    Controller, Get, Post, Patch, Delete,
    Param, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { SubscriptionsService } from './subscriptions.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('subscriptions')
  @UseGuards(JwtAuthGuard)
  export class SubscriptionsController {
    constructor(private readonly service: SubscriptionsService) {}
  
    // Subscribe to a module
    @Post()
    create(@Req() req: any, @Body() body: {
      moduleId: string;
      moduleType: string;
      moduleName: string;
      planType?: string;
      billingAmount?: number;
    }) {
      return this.service.create({
        userId: req.user._id.toString(),
        ...body,
      });
    }
  
    // Get current user subscriptions
    @Get('my')
    getMySubscriptions(@Req() req: any) {
      return this.service.findByUser(req.user._id.toString());
    }
  
    // Get billing summary for current user
    @Get('billing-summary')
    getBillingSummary(@Req() req: any) {
      return this.service.getBillingSummary(req.user._id.toString());
    }
  
    // Get all subscriptions (admin) or own (user)
    @Get()
    findAll(
      @Req() req: any,
      @Query('status') status?: string,
      @Query('moduleType') moduleType?: string,
      @Query('userId') userId?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      const isAdmin = req.user.role === 'admin';
      return this.service.findAll({
        userId: isAdmin ? userId : req.user._id.toString(),
        status,
        moduleType,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
      });
    }
  
    // Admin: extend trial
    @Patch(':id/extend-trial')
    extendTrial(
      @Param('id') id: string,
      @Body() body: { days: number },
      @Req() req: any,
    ) {
      return this.service.extendTrial(id, body.days, req.user._id.toString());
    }
  
    // Admin: set free forever
    @Patch(':id/free-forever')
    setFreeForever(@Param('id') id: string, @Req() req: any) {
      return this.service.setFreeForever(id, req.user._id.toString());
    }
  
    // Cancel subscription
    @Patch(':id/cancel')
    cancel(@Param('id') id: string, @Req() req: any) {
      return this.service.cancel(id, req.user._id.toString());
    }
  
    // Soft delete
    @Delete(':id')
    softDelete(@Param('id') id: string) {
      return this.service.softDelete(id);
    }
  }