import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatbotsService } from './chatbots.service';

@Controller('chatbots')
@UseGuards(JwtAuthGuard)
export class ChatbotsController {
  constructor(private chatbotsService: ChatbotsService) {}

  // Must come before ':id' routes so Nest doesn't match "admin" as an :id.
  @Get('admin/all')
  findAllAdmin(@Req() req: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.chatbotsService.findAllAdmin();
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.chatbotsService.create(req.user._id.toString(), body);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.chatbotsService.findAllByUser(req.user._id.toString());
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.findOne(id, req.user._id.toString());
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.chatbotsService.update(id, req.user._id.toString(), body);
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.delete(id, req.user._id.toString());
  }

  @Post(':id/knowledge')
  addKnowledge(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.chatbotsService.addKnowledge(id, req.user._id.toString(), body);
  }

  @Get(':id/knowledge')
  listKnowledge(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.listKnowledge(id, req.user._id.toString());
  }

  @Delete(':id/knowledge/:kId')
  deleteKnowledge(@Req() req: any, @Param('id') id: string, @Param('kId') kId: string) {
    return this.chatbotsService.deleteKnowledge(id, kId, req.user._id.toString());
  }

  @Get(':id/conversations')
  getConversations(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatbotsService.getConversations(
      id,
      req.user._id.toString(),
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id/analytics')
  getAnalytics(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.getAnalytics(id, req.user._id.toString());
  }

  @Get(':id/embed-code')
  getEmbedCode(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.getEmbedCode(id, req.user._id.toString());
  }

  // ── Pricing & billing ──────────────────────────────────────

  @Get(':id/billing')
  getBillingHistory(@Req() req: any, @Param('id') id: string) {
    const isAdmin = req.user.role === 'admin';
    return this.chatbotsService.getBillingHistory(id, req.user._id.toString(), isAdmin);
  }

  @Put(':id/pricing')
  updatePricing(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.chatbotsService.updatePricing(id, body);
  }

  @Post(':id/notify-payment')
  notifyPayment(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.chatbotsService.notifyPayment(id, req.user._id.toString(), body);
  }

  @Post(':id/confirm-payment')
  confirmPayment(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.chatbotsService.confirmPayment(id, body);
  }
}
