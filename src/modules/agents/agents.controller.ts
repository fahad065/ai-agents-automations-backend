import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('agents')
export class AgentsController {
  constructor(private agentsService: AgentsService) {}

  // ─── Public routes (no auth needed) ─────────────────────────

  @Get('templates')
  getTemplates() {
    return this.agentsService.getTemplates(true);
  }

  @Get('templates/:slug')
  getTemplateBySlug(@Param('slug') slug: string) {
    return this.agentsService.getTemplateBySlug(slug);
  }

  // ─── Protected routes ────────────────────────────────────────

  @Post('templates/seed')
  @UseGuards(JwtAuthGuard)
  seedTemplates() {
    return this.agentsService.seedTemplates();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    return this.agentsService.createAgent(req.user._id.toString(), body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: any) {
    return this.agentsService.getUserAgents(req.user._id.toString());
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.agentsService.updateAgent(req.user._id.toString(), id, body);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard)
  toggle(@Req() req: any, @Param('id') id: string) {
    return this.agentsService.toggleAgentStatus(req.user._id.toString(), id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: any, @Param('id') id: string) {
    return this.agentsService.deleteAgent(req.user._id.toString(), id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.agentsService.getAgentById(req.user._id.toString(), id);
  }
  
}