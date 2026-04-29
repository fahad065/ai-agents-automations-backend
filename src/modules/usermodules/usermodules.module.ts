import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModulesController } from './usermodules.controller';
import { UserModulesService } from './usermodules.service';
import { UserModule, UserModuleSchema } from '../modules/schemas/user-module.schema';
import { PipelineRun, PipelineRunSchema } from '../pipeline-runs/schemas/pipeline-run.schema';
import { UserModulesCron } from './usermodules.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserModule.name, schema: UserModuleSchema },
      { name: PipelineRun.name, schema: PipelineRunSchema }
    ]),
  ],
  controllers: [UserModulesController],
  providers: [UserModulesService, UserModulesCron],
  exports: [UserModulesService],
})
export class UserModulesModule {}