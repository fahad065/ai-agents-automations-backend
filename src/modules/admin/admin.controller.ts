import { Controller, Get, Post, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.adminService.getOverview();
  }

  @Get('revenue')
  getRevenue(@Req() req: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.adminService.getRevenue();
  }

  @Get('users')
  listUsers(@Req() req: any) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.adminService.listUsers();
  }

  @Post('email/send')
  sendEmail(@Req() req: any, @Body() body: { to: string[]; subject: string; html: string }) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return this.adminService.sendCustomEmail(body.to, body.subject, body.html);
  }
}