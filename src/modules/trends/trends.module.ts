import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';
import { Trend, TrendSchema } from './schemas/trend.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trend.name, schema: TrendSchema }]),
    HttpModule,
  ],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}