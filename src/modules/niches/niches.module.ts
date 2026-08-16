import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NichesController } from './niches.controller';
import { NichesService } from './niches.service';
import { Niche, NicheSchema } from './niches.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Niche.name, schema: NicheSchema }]),
  ],
  controllers: [NichesController],
  providers: [NichesService],
  exports: [NichesService],
})
export class NichesModule {}
