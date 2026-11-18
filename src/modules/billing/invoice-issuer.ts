// Who issues LogicMate invoices. Update this once the trade license / LLC
// is in place (legal name, address, and TRN if VAT-registered — a VAT line
// is added to the PDF only when `vatRate` is set).
export const INVOICE_ISSUER = {
  name: 'LogicMate',
  addressLines: ['Dubai, United Arab Emirates'],
  email: 'billing@logicmate.io',
  website: 'logicmate.io',
  trn: undefined as string | undefined,
  vatRate: 0,
};
