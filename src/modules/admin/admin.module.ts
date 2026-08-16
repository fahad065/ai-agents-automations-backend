import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PipelineRun, PipelineRunSchema } from '../pipeline-runs/schemas/pipeline-run.schema';
import { UserModule as UserModuleModel, UserModuleSchema } from '../modules/schemas/user-module.schema';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PipelineRun.name, schema: PipelineRunSchema },
      { name: UserModuleModel.name, schema: UserModuleSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}