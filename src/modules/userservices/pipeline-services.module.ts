import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PipelineServicesController } from './pipeline-services.controller';
import { PipelineServicesService } from './pipeline-services.service';
import { PipelineServicesCron } from './pipeline-services.cron';
import { PipelineRun, PipelineRunSchema } from '../pipeline-runs/schemas/pipeline-run.schema';
import { PipelineRunsService } from '../pipeline-runs/pipeline-runs.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { EmailModule } from '../email/email.module';

// Agents/automations on userservices (the userservices models themselves come
// from the global UserServicesModule).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PipelineRun.name, schema: PipelineRunSchema },
      { name: User.name, schema: UserSchema },
      { name: Service.name, schema: ServiceSchema },
    ]),
    EmailModule,
  ],
  controllers: [PipelineServicesController],
  providers: [PipelineServicesService, PipelineServicesCron, PipelineRunsService],
  exports: [PipelineServicesService],
})
export class PipelineServicesModule {}
