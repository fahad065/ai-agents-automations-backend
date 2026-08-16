import {
    Controller, Get, Post, Query, Body, Req, UseGuards,
  } from '@nestjs/common';
  import { BillingService } from './billing.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('billing')
  @UseGuards(JwtAuthGuard)
  export class BillingController {
    constructor(private readonly service: BillingService) {}
  
    // Get billing records (admin sees all, user sees own)
    @Get()
    findAll(
      @Req() req: any,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('moduleType') moduleType?: string,
      @Query('userId') userId?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      const isAdmin = req.user.role === 'admin';
      return this.service.findAll({
        userId: isAdmin ? userId : req.user._id.toString(),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        moduleType,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
      });
    }
  
    // Get monthly summary
    @Get('summary')
    getMonthlySummary(@Req() req: any) {
      const isAdmin = req.user.role === 'admin';
      return this.service.getMonthlySummary(
        isAdmin ? undefined : req.user._id.toString()
      );
    }
  
    // Admin: get API costs breakdown
    @Get('api-costs')
    getApiCosts(
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.service.getApiCostsBreakdown(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
      );
    }
  
    // Admin: profit/loss
    @Get('profit-loss')
    getProfitLoss(
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.service.getProfitLoss(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
      );
    }
  
    // Record billing event (internal use)
    @Post()
    create(@Req() req: any, @Body() body: {
      moduleType: string;
      moduleName: string;
      amount: number;
      description: string;
      type?: string;
      pipelineRunId?: string;
      apiCosts?: { openai?: number; seedance?: number; atlas?: number };
    }) {
      return this.service.create({
        userId: req.user._id.toString(),
        ...body,
      });
    }
  }