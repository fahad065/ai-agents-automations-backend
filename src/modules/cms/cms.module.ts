import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { Cms, CmsSchema } from './schemas/cms.schema';

// Page/BlogPost schemas are no longer registered here — superseded by the
// merged Cms schema. The old `pages`/`blogposts` collections are migrated
// by scripts/migrate-cms.js (a standalone script, not run through this
// module) and are only dropped manually from Atlas once that's verified.
// The old schema files are left in schemas/ for now, unused, in case
// anything needs inspecting before that manual drop.
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