import {
    Controller, Get, Post,
    Body, Param, Req, UseGuards,
  } from '@nestjs/common';
  import { TrendsService } from './trends.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('trends')
  @UseGuards(JwtAuthGuard)
  export class TrendsController {
    constructor(private trendsService: TrendsService) {}
  
    @Post('discover')
    discover(@Req() req: any, @Body() body: any) {
      return this.trendsService.discoverTrends(
        req.user._id.toString(),
        body.agentId,
        body.niche,
      );
    }
  
    @Get(':agentId')
    findAll(@Req() req: any, @Param('agentId') agentId: string) {
      return this.trendsService.getTrends(req.user._id.toString(), agentId);
    }
  
    @Post(':trendId/use')
    markUsed(@Param('trendId') trendId: string) {
      return this.trendsService.markTrendUsed(trendId);
    }
  }