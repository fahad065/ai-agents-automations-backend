import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ChatbotUserService, ChatbotUserServiceSchema, UserService, UserServiceSchema,
} from './schemas/userservice.schema';
import { UserServicesMigration } from './userservices.migration';

// Owns the `userservices` collection (ai/architecture.md). Global so the
// chatbot, chat, users and account-deletion modules can inject the models
// without each re-registering them.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserService.name, schema: UserServiceSchema },
      { name: ChatbotUserService.name, schema: ChatbotUserServiceSchema },
    ]),
  ],
  providers: [UserServicesMigration],
  exports: [MongooseModule],
})
export class UserServicesModule {}
