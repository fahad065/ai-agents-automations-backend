import { BillingService } from './billing.service';

const ID = '507f1f77bcf86cd799439099';

function build(record: any, storage: any = { isConfigured: () => false, getObject: jest.fn().mockResolvedValue(null), putObject: jest.fn() }) {
  const doc: any = { ...record };
  const billingModel: any = {
    findById: jest.fn().mockImplementation(() => {
      const p: any = Promise.resolve(doc);
      p.lean = () => Promise.resolve(doc);
      return p;
    }),
    updateOne: jest.fn().mockImplementation((_f: any, u: any) => Promise.resolve(Object.assign(doc, u.$set))),
    findOneAndUpdate: jest.fn().mockImplementation((_f: any, u: any) => Promise.resolve(Object.assign(doc, u.$set))),
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockImplementation(() => Promise.resolve(doc)) }),
  };
  let seq = 0;
  const counterModel: any = { findOneAndUpdate: jest.fn().mockImplementation(() => Promise.resolve({ seq: ++seq })) };
  const userModel: any = {
    findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Omar', email: 'omar@example.com', profile: { country: 'UAE' } }) }) }),
  };
  return { svc: new BillingService(billingModel, counterModel, userModel, storage), doc, counterModel, storage };
}

describe('BillingService invoices', () => {
  it('numbers invoices LM-<year>-0001 and freezes the invoice line', async () => {
    const { svc, doc } = build({ _id: ID, amount: 149, currency: 'USD' });
    const out = await svc.issueInvoice(ID, { line: 'Clinic Chatbot "Test" — Pro plan, monthly fee' });
    expect(out.invoiceNumber).toBe(`LM-${new Date().getUTCFullYear()}-0001`);
    expect(doc.invoiceLine).toContain('Pro plan');
  });

  it('never renumbers an invoice that already has a number', async () => {
    const { svc, counterModel } = build({ _id: ID, amount: 149, invoiceNumber: 'LM-2026-0007' });
    const out = await svc.issueInvoice(ID, { line: 'x' });
    expect(out.invoiceNumber).toBe('LM-2026-0007');
    expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('renders a real PDF for the owner, refuses anyone else', async () => {
    const owner = '507f1f77bcf86cd799439011';
    const { svc } = build({ _id: ID, userId: owner, amount: 149, currency: 'USD', invoiceNumber: 'LM-2026-0001', invoiceIssuedAt: new Date(), invoiceLine: 'Clinic Chatbot — Pro', billingDate: new Date(), transactionRef: 'TX-1' });
    const { filename, pdf } = await svc.invoicePdf(ID, { userId: owner, isAdmin: false });
    expect(filename).toBe('LogicMate-Invoice-LM-2026-0001.pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(svc.invoicePdf(ID, { userId: 'someone-else', isAdmin: false })).rejects.toThrow();
  });
});

describe('BillingService — invoices saved in private storage', () => {
  const owner = '507f1f77bcf86cd799439011';
  const issued = { _id: ID, userId: owner, amount: 149, currency: 'USD', invoiceNumber: 'LM-2026-0003', invoiceIssuedAt: new Date('2026-11-20T10:00:00Z'), invoiceLine: 'Clinic Chatbot — Pro', billingDate: new Date() };

  it('saves the PDF at issue time under invoices/<year>/<number>.pdf', async () => {
    const storage = { isConfigured: () => true, getObject: jest.fn().mockResolvedValue(null), putObject: jest.fn().mockResolvedValue(undefined) };
    const { svc, doc } = build({ ...issued }, storage);
    const { pdf, filename } = await svc.archiveInvoice(ID);
    expect(filename).toBe('LogicMate-Invoice-LM-2026-0003.pdf');
    expect(storage.putObject).toHaveBeenCalledWith('private', 'invoices/2026/LM-2026-0003.pdf', pdf, 'application/pdf');
    expect(doc.invoiceKey).toBe('invoices/2026/LM-2026-0003.pdf');
  });

  it('downloads serve the saved copy, not a fresh render', async () => {
    const saved = Buffer.from('%PDF-saved-copy');
    const storage = { isConfigured: () => true, getObject: jest.fn().mockResolvedValue(saved), putObject: jest.fn() };
    const { svc } = build({ ...issued, invoiceKey: 'invoices/2026/LM-2026-0003.pdf' }, storage);
    const { pdf } = await svc.invoicePdf(ID, { userId: owner, isAdmin: false });
    expect(pdf).toBe(saved);
    expect(storage.getObject).toHaveBeenCalledWith('private', 'invoices/2026/LM-2026-0003.pdf');
  });

  it('without storage, still emails/downloads a rendered PDF', async () => {
    const { svc, storage } = build({ ...issued });
    const { pdf } = await svc.archiveInvoice(ID);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
