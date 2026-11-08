import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { Cms, CmsSchema } from './schemas/cms.schema';

// The old Page/BlogPost schema files are deleted — this module now only
// ever knows about the one merged Cms model. The old `pages`/`blogposts`
// collections in Atlas are migrated by scripts/migrate-cms.js (a
// standalone script, not run through this module) and are dropped
// manually from Atlas once that migration is verified in production.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cms.name, schema: CmsSchema },
    ]),
  ],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}