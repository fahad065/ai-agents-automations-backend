import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BillingDocument = Billing & Document;

export enum BillingType {
  SUBSCRIPTION = 'subscription',
  USAGE        = 'usage',
  REFUND       = 'refund',
  SETUP        = 'setup',
}

export enum BillingStatus {
  PAID    = 'paid',
  PENDING = 'pending',
  FAILED  = 'failed',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
class ApiCostBreakdown {
  @Prop({ default: 0 }) openai: number;
  @Prop({ default: 0 }) seedance: number;
  @Prop({ default: 0 }) atlas: number;
  @Prop({ default: 0 }) other: number;
}

@Schema({ timestamps: true })
export class Billing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  subscriptionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  userserviceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  pipelineRunId?: Types.ObjectId;

  @Prop({ required: true })
  moduleType: string;

  @Prop({ required: true })
  moduleName: string;

  @Prop({ enum: BillingType, default: BillingType.USAGE })
  type: BillingType;

  @Prop({ required: true, default: 0 })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ enum: BillingStatus, default: BillingStatus.PENDING })
  status: BillingStatus;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Object, default: {} })
  apiCosts: ApiCostBreakdown;

  // Paddle
  @Prop()
  paddleTransactionId?: string;

  @Prop()
  paddleSubscriptionId?: string;

  @Prop({ default: () => new Date() })
  billingDate: Date;

  // What a chatbot payment was for (setup fee, a month, the Basic → Pro
  // upgrade) and the customer's bank-transfer reference.
  @Prop({ enum: ['setup', 'monthly', 'upgrade'] })
  kind?: 'setup' | 'monthly' | 'upgrade';

  @Prop()
  transactionRef?: string;

  // Set when the admin confirms the payment (BillingService.issueInvoice):
  // a sequential number (LM-2026-0001), the issue date, the period the
  // payment covers and the line printed on the invoice — frozen at issue
  // time so a later rename doesn't change an invoice already sent.
  @Prop()
  invoiceNumber?: string;

  // The issued invoice PDF, saved in the private R2 bucket
  // (invoices/<year>/<number>.pdf) at the moment it's issued, so the copy
  // never changes afterwards. Older invoices have none and are rendered on
  // download.
  @Prop()
  invoiceKey?: string;

  @Prop()
  invoiceIssuedAt?: Date;

  @Prop()
  invoiceLine?: string;

  @Prop()
  periodStart?: Date;

  @Prop()
  periodEnd?: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const BillingSchema = SchemaFactory.createForClass(Billing);

BillingSchema.index({ userId: 1, billingDate: -1 });
BillingSchema.index({ userId: 1, status: 1 });
BillingSchema.index({ billingDate: -1 });
BillingSchema.index({ isDeleted: 1 });
BillingSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });
BillingSchema.index({ userserviceId: 1, status: 1 });