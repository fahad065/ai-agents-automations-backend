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
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  // Step 2 of an upload: the browser already PUT the file to the private
  // bucket via POST /uploads (purpose 'user-document'); this records it.
  // Admin can pass body.userId to add a document on a client's behalf
  // (e.g. onboarding) — ignored for non-admins.
  @Post()
  async create(
    @Req() req: any,
    @Body() body: { documentType: string; key: string; name?: string; userId?: string },
  ) {
    const ownerId = req.user.role === 'admin' && body?.userId ? body.userId : req.user._id.toString();
    return this.documentsService.createDocument(ownerId, body?.documentType, { key: body?.key, name: body?.name }, {
      id: req.user._id.toString(),
      role: req.user.role,
    });
  }

  // A short-lived link to open the file (owner or admin).
  @Get(':id/file')
  file(@Req() req: any, @Param('id') id: string) {
    return this.documentsService.documentUrl(req.user._id.toString(), id, req.user.role === 'admin');
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
