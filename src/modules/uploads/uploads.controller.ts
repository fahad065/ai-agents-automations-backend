import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

// One endpoint for every upload on the platform. The browser:
//  1. POST /uploads { purpose, contentType, size, name, ...details } → signed URL
//  2. PUTs the file to that URL (straight to Cloudflare R2)
//  3. saves the returned `key` on its own record (e.g. a knowledge entry)
// DELETE /uploads?purpose=&key=&... drops an upload that was never saved;
// GET /uploads/file?purpose=&key=&... gives a short-lived link to a private file.
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  private caller(req: any) {
    return { userId: req.user._id.toString(), isAdmin: req.user.role === 'admin' };
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.uploads.createUpload(this.caller(req), body);
  }

  @Delete()
  discard(@Req() req: any, @Query() query: any) {
    return this.uploads.discard(this.caller(req), query);
  }

  @Get('file')
  file(@Req() req: any, @Query() query: any) {
    return this.uploads.fileUrl(this.caller(req), query);
  }
}
