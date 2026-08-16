import { Controller, Get, UseGuards, Req } from '@nestjs/common';
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
}