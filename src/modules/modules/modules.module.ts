import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModuleTemplate, ModuleSchema } from './schemas/module.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ModuleTemplate.name, schema: ModuleSchema },
    ]),
  ],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}