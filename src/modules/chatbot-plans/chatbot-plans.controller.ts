import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ChatbotPlansService } from './chatbot-plans.service';

@Controller()
export class ChatbotPlansController {
  constructor(private plansService: ChatbotPlansService) {}

  // ─── Public — the pricing page reads this ──────────────────────

  @Get('chatbot-plans')
  findActive() {
    return this.plansService.findActive();
  }

  // ─── Admin ──────────────────────────────────────────────────────

  @Get('admin/chatbot-plans')
  @UseGuards(JwtAuthGuard, AdminGuard)
  findAllAdmin() {
    return this.plansService.findAllAdmin();
  }

  @Post('admin/chatbot-plans')
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() body: any) {
    return this.plansService.create(body);
  }

  @Post('admin/chatbot-plans/seed')
  @UseGuards(JwtAuthGuard, AdminGuard)
  seedDefaults() {
    return this.plansService.seedDefaults();
  }

  @Put('admin/chatbot-plans/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() body: any) {
    return this.plansService.update(id, body);
  }

  @Delete('admin/chatbot-plans/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  delete(@Param('id') id: string) {
    return this.plansService.delete(id);
  }
}
