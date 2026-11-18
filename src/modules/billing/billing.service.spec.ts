import { BillingService } from './billing.service';

const ID = '507f1f77bcf86cd799439099';

function build(record: any) {
  const doc: any = { ...record };
  const billingModel: any = {
    findById: jest.fn().mockImplementation(() => Promise.resolve(doc)),
    findOneAndUpdate: jest.fn().mockImplementation((_f: any, u: any) => Promise.resolve(Object.assign(doc, u.$set))),
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockImplementation(() => Promise.resolve(doc)) }),
  };
  let seq = 0;
  const counterModel: any = { findOneAndUpdate: jest.fn().mockImplementation(() => Promise.resolve({ seq: ++seq })) };
  const userModel: any = {
    findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Omar', email: 'omar@example.com', profile: { country: 'UAE' } }) }) }),
  };
  return { svc: new BillingService(billingModel, counterModel, userModel), doc, counterModel };
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
