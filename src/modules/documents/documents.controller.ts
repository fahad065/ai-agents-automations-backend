import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  // Admin can pass body.userId to upload on a client's behalf (e.g.
  // onboarding) - same bypass shape every other admin-aware route in this
  // codebase uses (api-keys, chatbots). Ignored for non-admins.
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: any,
    @Body('documentType') documentType: string,
    @Body('userId') targetUserId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    const ownerId = req.user.role === 'admin' && targetUserId ? targetUserId : req.user._id.toString();
    return this.documentsService.uploadDocument(ownerId, documentType, file, {
      id: req.user._id.toString(),
      role: req.user.role,
    });
  }

  // Admin can pass ?userId= to check a specific client's documents.
  // Ignored for non-admins.
  @Get()
  findAll(@Req() req: any, @Query('userId') targetUserId?: string) {
    const ownerId = req.user.role === 'admin' && targetUserId ? targetUserId : req.user._id.toString();
    return this.documentsService.listDocuments(ownerId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const isAdmin = req.user.role === 'admin';
    return this.documentsService.deleteDocument(req.user._id.toString(), id, isAdmin, {
      id: req.user._id.toString(),
      role: req.user.role,
    });
  }
}
