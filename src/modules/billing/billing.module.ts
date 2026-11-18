import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { Billing, BillingSchema } from './schemas/billing.schema';
import { InvoiceCounter, InvoiceCounterSchema } from './schemas/invoice-counter.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Billing.name, schema: BillingSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}