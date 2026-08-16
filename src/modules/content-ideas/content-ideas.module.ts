import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentIdeasController } from './content-ideas.controller';
import { ContentIdeasService } from './content-ideas.service';
import { ContentIdea, ContentIdeaSchema } from './schemas/content-idea.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentIdea.name, schema: ContentIdeaSchema },
    ]),
    NotificationsModule
  ],
  controllers: [ContentIdeasController],
  providers: [ContentIdeasService],
  exports: [ContentIdeasService],
})
export class ContentIdeasModule {}