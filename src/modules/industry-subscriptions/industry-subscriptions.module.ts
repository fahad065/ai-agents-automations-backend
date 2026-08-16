import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IndustrySubscriptionsController } from './industry-subscriptions.controller';
import { IndustrySubscriptionsService } from './industry-subscriptions.service';
import { IndustrySubscription, IndustrySubscriptionSchema } from './industry-subscription.schema';
import { IndustriesModule } from '../industries/industries.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IndustrySubscription.name, schema: IndustrySubscriptionSchema },
    ]),
    IndustriesModule,
  ],
  controllers: [IndustrySubscriptionsController],
  providers: [IndustrySubscriptionsService],
  exports: [IndustrySubscriptionsService],
})
export class IndustrySubscriptionsModule {}
