import {
  Controller, Get, Post, Patch,
  Delete, Param, Body, Req, UseGuards,
} from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('automations')
export class AutomationsController {
  constructor(private automationsService: AutomationsService) {}

  // ─── Public routes ───────────────────────────────────────

  @Get('templates')
  findAll() {
    return this.automationsService.findAll(true);
  }

  @Get('templates/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.automationsService.findBySlug(slug);
  }

  // ─── Seed (admin) ────────────────────────────────────────

  @Post('templates/seed')
  @UseGuards(JwtAuthGuard)
  seed() {
    return this.automationsService.seed();
  }

  // ─── User automations (protected) ───────────────────────

  @Get('my')
  @UseGuards(JwtAuthGuard)
  getMyAutomations(@Req() req: any) {
    return this.automationsService.getUserAutomations(req.user._id.toString());
  }

  @Post('activate')
  @UseGuards(JwtAuthGuard)
  activate(@Req() req: any, @Body() body: any) {
    return this.automationsService.activateAutomation(
      req.user._id.toString(),
      body.templateId,
    );
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard)
  toggle(@Req() req: any, @Param('id') id: string) {
    return this.automationsService.toggleAutomation(
      req.user._id.toString(), id,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.automationsService.cancelAutomation(
      req.user._id.toString(), id,
    );
  }
}