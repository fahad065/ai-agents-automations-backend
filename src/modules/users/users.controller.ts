import {
    Controller,
    Get,
    Patch,
    Delete,
    Body,
    Req,
    UseGuards,
    Query,
  } from '@nestjs/common';
  import { UsersService } from './users.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
  
  @Controller('users')
  @UseGuards(JwtAuthGuard)
  export class UsersController {
    constructor(private usersService: UsersService) {}
  
    @Get('profile')
    @UseGuards(JwtAuthGuard)
    getProfile(@Req() req: any) {
      return this.usersService.getProfile(req.user._id.toString());
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard)
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
  }