import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PipelineRunsController } from './pipeline-runs.controller';
import { PipelineRunsService } from './pipeline-runs.service';
import { PipelineRun, PipelineRunSchema } from './schemas/pipeline-run.schema';
import { UserModulesModule } from '../usermodules/usermodules.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([ 
      { name: PipelineRun.name, schema: PipelineRunSchema },
      { name: User.name, schema: UserSchema },  // ← add
    ]),
    UserModulesModule,
    NotificationsModule,
    EmailModule
  ],
  controllers: [PipelineRunsController],
  providers: [PipelineRunsService],
  exports: [PipelineRunsService]
})
export class PipelineRunsModule {}
