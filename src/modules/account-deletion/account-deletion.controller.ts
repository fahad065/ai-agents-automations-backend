import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AccountDeletionService } from './account-deletion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountDeletionController {
  constructor(private accountDeletionService: AccountDeletionService) {}

  @Get('export')
  async exportData(@Req() req: any, @Res() res: Response) {
    const buffer = await this.accountDeletionService.exportUserData(req.user._id.toString());
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="logicmate-my-data.xlsx"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('deletion/status')
  getStatus(@Req() req: any) {
    return this.accountDeletionService.getStatus(req.user._id.toString());
  }

  @Post('deletion/request')
  requestDeletion(@Req() req: any) {
    return this.accountDeletionService.requestDeletion(req.user._id.toString());
  }

  @Post('deletion/cancel')
  cancelDeletion(@Req() req: any) {
    return this.accountDeletionService.cancelDeletion(req.user._id.toString());
  }
}
