import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { TrendsModule } from './modules/trends/trends.module';
import { ContentIdeasModule } from './modules/content-ideas/content-ideas.module';
import { CmsModule } from './modules/cms/cms.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PipelineRunsModule } from './modules/pipeline-runs/pipeline-runs.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ModulesModule } from './modules/modules/modules.module';
import { UserModulesModule } from './modules/usermodules/usermodules.module';
import { EmailModule } from './modules/email/email.module';
import { AdminModule } from './modules/admin/admin.module';
import { IndustriesModule } from './modules/industries/industries.module';
import { IndustrySubscriptionsModule } from './modules/industry-subscriptions/industry-subscriptions.module';
import { ChatbotsModule } from './modules/chatbots/chatbots.module';
import { ChatModule } from './modules/chat/chat.module';
import { ChatbotPlansModule } from './modules/chatbot-plans/chatbot-plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
        retryWrites: true,
        w: 'majority',
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,  // ping MongoDB every 10 seconds
      }),
      inject: [ConfigService],
    }),

    // Rate limiting — 100 requests per minute globally
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 1000,
      },
    ]),

    ScheduleModule.forRoot(),

    AuthModule,
    UsersModule,
    ApiKeysModule,
    TrendsModule,
    ContentIdeasModule,
    CmsModule,
    NotificationsModule,
    PipelineRunsModule,
    SubscriptionsModule,
    BillingModule,
    FeedbackModule,
    ModulesModule,
    UserModulesModule,
    EmailModule,
    AdminModule,
    IndustriesModule,
    IndustrySubscriptionsModule,
    ChatbotsModule,
    ChatModule,
    ChatbotPlansModule,
  ],
  providers: [
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}