import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeBase, KnowledgeBaseSchema } from '../chatbots/schemas/knowledge-base.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { UploadedDocument, UploadedDocumentSchema } from '../documents/schemas/document.schema';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: UploadedDocument.name, schema: UploadedDocumentSchema },
    ]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, StorageCleanupService],
  exports: [UploadsService],
})
export class UploadsModule {}
