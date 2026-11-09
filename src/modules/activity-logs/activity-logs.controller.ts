import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityAction } from './schemas/activity-log.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  // Every logged-in user — admin or not — sees only their own feed here.
  @Get('my')
  my(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityLogsService.findForUser(
      req.user._id.toString(),
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  // Admin-only — every user's activity, filterable.
  @Get('admin')
  @UseGuards(AdminGuard)
  admin(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: ActivityAction,
  ) {
    return this.activityLogsService.findAllAdmin({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      userId,
      entityType,
      action,
    });
  }
}
