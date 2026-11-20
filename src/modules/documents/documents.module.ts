import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadedDocument, UploadedDocumentSchema } from './schemas/document.schema';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: UploadedDocument.name, schema: UploadedDocumentSchema }]), UploadsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
