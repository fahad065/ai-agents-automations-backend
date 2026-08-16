import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}
  // ── Current user ──────────────────────────────────────────

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user._id.toString());
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user._id.toString(), dto);
  }

  @Patch('change-password')
  changePassword(@Req() req: any, @Body() body: any) {
    return this.usersService.changePassword(
      req.user._id.toString(),
      body.oldPassword,
      body.newPassword,
    );
  }

  @Delete('deactivate')
  deactivate(@Req() req: any) {
    return this.usersService.deactivate(req.user._id.toString());
  }

  // ── Admin endpoints ───────────────────────────────────────

  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('planType') planType?: string,
  ) {
    if (req.user.role !== 'admin') return { users: [], total: 0 };
    return this.usersService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      { search, isActive, planType },
    );
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'admin') {
      return this.usersService.getProfile(req.user._id.toString());
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  updateUser(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.usersService.adminUpdate(id, body);
  }

  @Delete(':id')
  deleteUser(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.usersService.adminDelete(id);
  }

  // Grant free forever
  @Patch(':id/grant-free')
  grantFree(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.usersService.adminUpdate(id, {
      isFreeForever: true,
      planType: 'lifetime',
    });
  }
  
  // Extend trial by X days
  @Patch(':id/extend-trial')
  extendTrial(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { days: number },
  ) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.usersService.extendTrial(id, body.days, req.user._id.toString());
  }
  
  // Pause/unpause user modules
  @Patch(':id/pause-modules')
  pauseModules(@Req() req: any, @Param('id') id: string, @Body() body: { pause: boolean }) {
    if (req.user.role !== 'admin') return { message: 'Forbidden' };
    return this.usersService.pauseUserModules(id, body.pause);
  }

  @Post('notify-payment')
  @UseGuards(JwtAuthGuard)
  async notifyPayment(@Req() req: any, @Body() body: { plan: string; transactionRef: string; notes?: string }) {
    const user = await this.usersService.findById(req.user._id);
    await this.emailService.sendAdminAlert(
      `💰 Payment notification from ${user.name}`,
      `
        User: ${user.name} (${user.email})
        Plan: ${body.plan}
        Transaction Ref: ${body.transactionRef}
        Notes: ${body.notes || 'none'}
        User ID: ${user._id}
        
        Go to admin dashboard to activate:
        https://www.logicmate.io/dashboard/users
      `
    );
    return { ok: true };
  }
}