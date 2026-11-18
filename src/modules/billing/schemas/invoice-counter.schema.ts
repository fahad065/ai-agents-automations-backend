import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// One document per year ({_id: 'invoice-2026', seq: 12}); BillingService
// increments it atomically so two confirmations at the same moment can
// never get the same invoice number.
@Schema({ collection: 'invoicecounters', versionKey: false })
export class InvoiceCounter {
  @Prop({ type: String })
  _id: string;

  @Prop({ default: 0 })
  seq: number;
}

export type InvoiceCounterDocument = InvoiceCounter & Document<string>;
export const InvoiceCounterSchema = SchemaFactory.createForClass(InvoiceCounter);
