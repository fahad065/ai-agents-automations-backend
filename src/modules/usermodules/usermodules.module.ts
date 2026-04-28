import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModulesController } from './usermodules.controller';
import { UserModulesService } from './usermodules.service';
import { UserModule, UserModuleSchema } from '../modules/schemas/user-module.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserModule.name, schema: UserModuleSchema },
    ]),
  ],
  controllers: [UserModulesController],
  providers: [UserModulesService],
  exports: [UserModulesService],
})
export class UserModulesModule {}