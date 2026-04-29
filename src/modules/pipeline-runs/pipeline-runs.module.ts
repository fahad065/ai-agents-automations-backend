import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PipelineRunsController } from './pipeline-runs.controller';
import { PipelineRunsService } from './pipeline-runs.service';
import { PipelineRun, PipelineRunSchema } from './schemas/pipeline-run.schema';
import { UserModulesModule } from '../usermodules/usermodules.module';

@Module({
  imports: [
    MongooseModule.forFeature([ { name: PipelineRun.name, schema: PipelineRunSchema } ]),
    UserModulesModule
  ],
  controllers: [PipelineRunsController],
  providers: [PipelineRunsService],
  exports: [PipelineRunsService]
})
export class PipelineRunsModule {}
