import {
  Controller, Get, Patch, Delete, Body,
  Req, UseGuards, Query, Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

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
}