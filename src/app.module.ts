import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { TenantSentryInterceptor } from './tenant-sentry.interceptor';
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

@Module({
  imports: [
    // Must be the first import so its providers (the exception filter
    // below depends on nothing from it directly, but Sentry's own docs
    // call for this ordering) are available before anything else boots.
    SentryModule.forRoot(),

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
  ],
  providers: [
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Reports any exception that reaches Nest's default error handling to
    // Sentry (a no-op until SENTRY_DSN is set — see src/instrument.ts).
    // Must be registered before any other APP_FILTER so it sees the
    // exception first; there are no other global filters in this app.
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // Tags every Sentry event captured during an authenticated request
    // with the calling user's id — see tenant-sentry.interceptor.ts.
    // This only covers requests that go through JwtAuthGuard; the public
    // chat engine (no req.user at all) tags itself explicitly in
    // chat.service.ts with the bot owner's id instead.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantSentryInterceptor,
    },
  ],
})
export class AppModule {}