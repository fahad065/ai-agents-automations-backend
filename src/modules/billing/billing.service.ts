import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Billing, BillingDocument, BillingStatus, BillingType } from './schemas/billing.schema';
import { InvoiceCounter, InvoiceCounterDocument } from './schemas/invoice-counter.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { renderInvoicePdf } from './invoice-pdf';
import { StorageService } from '../storage/storage.service';

export type PaymentKind = 'setup' | 'monthly' | 'upgrade';

// Records written before `kind` existed only say it in the description.
const LEGACY_KIND_PREFIX: Record<PaymentKind, RegExp> = {
  setup: /^Setup fee/,
  monthly: /^Monthly fee/,
  upgrade: /^Tier upgrade/,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    @InjectModel(Billing.name)
    private billingModel: Model<BillingDocument>,
    @InjectModel(InvoiceCounter.name)
    private counterModel: Model<InvoiceCounterDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private storage: StorageService,
  ) {}

  // Record a billing event
  async create(data: {
    userId: string;
    moduleType: string;
    moduleName: string;
    amount: number;
    description: string;
    type?: string;
    status?: string;
    pipelineRunId?: string;
    subscriptionId?: string;
    userserviceId?: string;
    kind?: PaymentKind;
    transactionRef?: string;
    apiCosts?: { openai?: number; seedance?: number; atlas?: number };
  }): Promise<BillingDocument> {
    return this.billingModel.create({
      userId: new Types.ObjectId(data.userId),
      moduleType: data.moduleType,
      moduleName: data.moduleName,
      amount: data.amount,
      description: data.description,
      type: data.type || BillingType.USAGE,
      status: data.status || BillingStatus.PAID,
      pipelineRunId: data.pipelineRunId ? new Types.ObjectId(data.pipelineRunId) : undefined,
      subscriptionId: data.subscriptionId ? new Types.ObjectId(data.subscriptionId) : undefined,
      userserviceId: data.userserviceId ? new Types.ObjectId(data.userserviceId) : undefined,
      kind: data.kind,
      transactionRef: data.transactionRef,
      apiCosts: data.apiCosts || {},
      billingDate: new Date(),
    });
  }

  // The customer's latest "I've paid" record for this kind of payment, if
  // any, that's still waiting for the admin.
  async findPending(userserviceId: string, kind: PaymentKind): Promise<BillingDocument | null> {
    return this.billingModel
      .findOne({
        userserviceId: new Types.ObjectId(userserviceId),
        status: BillingStatus.PENDING,
        isDeleted: false,
        $or: [{ kind }, { kind: { $exists: false }, description: LEGACY_KIND_PREFIX[kind] }],
      })
      .sort({ billingDate: -1 });
  }

  // Gives a paid record its invoice number (LM-<year>-0001, counting per
  // year) and freezes what the invoice says. Calling it again on a record
  // that already has a number changes nothing.
  async issueInvoice(
    id: string,
    details: { line: string; periodStart?: Date; periodEnd?: Date },
  ): Promise<BillingDocument> {
    const existing = await this.billingModel.findById(id);
    if (!existing) throw new NotFoundException('Billing record not found');
    if (existing.invoiceNumber) return existing;
    const issuedAt = new Date();
    const year = issuedAt.getUTCFullYear();
    const counter = await this.counterModel.findOneAndUpdate(
      { _id: `invoice-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const invoiceNumber = `LM-${year}-${String(counter!.seq).padStart(4, '0')}`;
    const updated = await this.billingModel.findOneAndUpdate(
      { _id: existing._id, invoiceNumber: { $exists: false } },
      { $set: { invoiceNumber, invoiceIssuedAt: issuedAt, invoiceLine: details.line, periodStart: details.periodStart, periodEnd: details.periodEnd } },
      { new: true },
    );
    return updated || (await this.billingModel.findById(id))!;
  }

  private async renderPdf(record: any): Promise<Buffer> {
    const user: any = await this.userModel.findById(record.userId).select('name email profile.company profile.country').lean();
    return renderInvoicePdf({
      invoiceNumber: record.invoiceNumber,
      issuedAt: record.invoiceIssuedAt || record.billingDate,
      customer: {
        name: user?.name || 'Customer',
        email: user?.email || '',
        company: user?.profile?.company,
        country: user?.profile?.country,
      },
      line: record.invoiceLine || record.moduleName,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      amount: record.amount,
      currency: record.currency || 'USD',
      transactionRef: record.transactionRef,
    });
  }

  private filename(record: { invoiceNumber?: string }) {
    return `LogicMate-Invoice-${record.invoiceNumber}.pdf`;
  }

  // Renders a just-issued invoice once and keeps that PDF in the private
  // bucket, so every later download is this exact copy. If storage isn't
  // set up the PDF is still returned (and rendered again on download).
  async archiveInvoice(id: string): Promise<{ filename: string; pdf: Buffer }> {
    const record: any = await this.billingModel.findById(id).lean();
    if (!record || !record.invoiceNumber) throw new NotFoundException('Invoice not found');
    if (record.invoiceKey) {
      const saved = await this.storage.getObject('private', record.invoiceKey);
      if (saved) return { filename: this.filename(record), pdf: saved };
    }
    const pdf = await this.renderPdf(record);
    if (this.storage.isConfigured('private')) {
      const year = new Date(record.invoiceIssuedAt || Date.now()).getUTCFullYear();
      const key = `invoices/${year}/${record.invoiceNumber}.pdf`;
      try {
        await this.storage.putObject('private', key, pdf, 'application/pdf');
        await this.billingModel.updateOne({ _id: record._id, invoiceKey: { $exists: false } }, { $set: { invoiceKey: key } });
      } catch (err: any) {
        this.logger.warn(`Saving invoice ${record.invoiceNumber} to storage failed: ${err?.message || err}`);
      }
    }
    return { filename: this.filename(record), pdf };
  }

  // The invoice PDF for one record — its owner or an admin only. Serves the
  // copy saved when it was issued; older invoices are rendered.
  async invoicePdf(id: string, viewer: { userId: string; isAdmin: boolean }): Promise<{ filename: string; pdf: Buffer }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Invoice not found');
    const record = await this.billingModel.findOne({ _id: id, isDeleted: false }).lean();
    if (!record || !record.invoiceNumber) throw new NotFoundException('Invoice not found');
    if (!viewer.isAdmin && String(record.userId) !== viewer.userId) throw new ForbiddenException();
    if (record.invoiceKey) {
      const saved = await this.storage.getObject('private', record.invoiceKey);
      if (saved) return { filename: this.filename(record), pdf: saved };
      this.logger.warn(`Invoice ${record.invoiceNumber}: saved PDF not found in storage, rendering it again`);
    }
    return { filename: this.filename(record), pdf: await this.renderPdf(record) };
  }

  async findById(id: string): Promise<BillingDocument | null> {
    return Types.ObjectId.isValid(id) ? this.billingModel.findById(id) : null;
  }

  async updateStatus(id: string, status: BillingStatus): Promise<BillingDocument | null> {
    return this.billingModel.findByIdAndUpdate(id, { status }, { new: true });
  }

  async findByUserService(userserviceId: string) {
    return this.billingModel
      .find({ userserviceId: new Types.ObjectId(userserviceId), isDeleted: false })
      .sort({ billingDate: -1 })
      .lean();
  }

  // Get billing records
  async findAll(options: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    moduleType?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, startDate, endDate, moduleType, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    const filter: any = { isDeleted: false };

    if (userId) filter.userId = new Types.ObjectId(userId);
    if (moduleType) filter.moduleType = moduleType;
    if (startDate || endDate) {
      filter.billingDate = {};
      if (startDate) filter.billingDate.$gte = startDate;
      if (endDate) filter.billingDate.$lte = endDate;
    }

    const [data, total] = await Promise.all([
      this.billingModel.find(filter).sort({ billingDate: -1 }).skip(skip).limit(limit).lean(),
      this.billingModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // Get monthly summary
  async getMonthlySummary(userId?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const filter: any = {
      isDeleted: false,
      billingDate: { $gte: startOfMonth },
      status: BillingStatus.PAID,
    };
    if (userId) filter.userId = new Types.ObjectId(userId);

    const agg = await this.billingModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$moduleName',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        }
      },
      { $sort: { total: -1 } }
    ]);

    const grandTotal = agg.reduce((sum, a) => sum + a.total, 0);

    return {
      grandTotal: Math.round(grandTotal * 100) / 100,
      byModule: agg.map(a => ({
        moduleName: a._id,
        total: Math.round(a.total * 100) / 100,
        count: a.count,
      })),
      month: startOfMonth.toISOString().slice(0, 7),
    };
  }

  // Get API costs breakdown (for admin payment dashboard)
  async getApiCostsBreakdown(startDate?: Date, endDate?: Date) {
    const filter: any = { isDeleted: false, status: BillingStatus.PAID };
    if (startDate || endDate) {
      filter.billingDate = {};
      if (startDate) filter.billingDate.$gte = startDate;
      if (endDate) filter.billingDate.$lte = endDate;
    }

    const agg = await this.billingModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalOpenAI: { $sum: '$apiCosts.openai' },
          totalSeedance: { $sum: '$apiCosts.seedance' },
          totalAtlas: { $sum: '$apiCosts.atlas' },
          count: { $sum: 1 },
        }
      }
    ]);

    return agg[0] || {
      totalAmount: 0,
      totalOpenAI: 0,
      totalSeedance: 0,
      totalAtlas: 0,
      count: 0,
    };
  }

  // Get profit/loss stats (admin only)
  async getProfitLoss(startDate?: Date, endDate?: Date) {
    const costs = await this.getApiCostsBreakdown(startDate, endDate);

    return {
      revenue: 0,        // Will come from Paddle webhooks
      costs: costs.totalAmount,
      profit: 0 - costs.totalAmount, // revenue - costs
      apiBreakdown: {
        openai: costs.totalOpenAI,
        seedance: costs.totalSeedance,
        atlas: costs.totalAtlas,
      }
    };
  }
}