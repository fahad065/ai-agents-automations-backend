import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModulesController } from './usermodules.controller';
import { UserModulesService } from './usermodules.service';
import { UserModule, UserModuleSchema } from '../modules/schemas/user-module.schema';
import { PipelineRun, PipelineRunSchema } from '../pipeline-runs/schemas/pipeline-run.schema';
import { UserModulesCron } from './usermodules.cron';
import { PipelineRunsService } from '../pipeline-runs/pipeline-runs.service';
import { EmailModule } from '../email/email.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TrialExpiryCron } from './trial-expiry.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserModule.name, schema: UserModuleSchema },
      { name: PipelineRun.name, schema: PipelineRunSchema },
      { name: User.name, schema: UserSchema },  // ← add this
    ]),
    EmailModule
  ],
  controllers: [UserModulesController],
  providers: [UserModulesService, UserModulesCron,TrialExpiryCron, PipelineRunsService],
  exports: [UserModulesService],
})
export class UserModulesModule {}