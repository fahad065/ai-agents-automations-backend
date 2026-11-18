import PDFDocument from 'pdfkit';
import { INVOICE_ISSUER } from './invoice-issuer';

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  customer: { name: string; email: string; company?: string; country?: string };
  line: string;
  periodStart?: Date;
  periodEnd?: Date;
  amount: number;
  currency: string;
  transactionRef?: string;
}

const PURPLE = '#6d4fd6';
const MUTED = '#6b7080';
const TEXT = '#1f2333';
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtMoney = (n: number, currency: string) =>
  `${currency === 'USD' ? '$' : currency + ' '}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A4 invoice, LogicMate branding, built-in Helvetica only (no font files).
export function renderInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${d.invoiceNumber}`, Author: INVOICE_ISSUER.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // Header
    doc.fillColor(PURPLE).font('Helvetica-Bold').fontSize(20).text(INVOICE_ISSUER.name, left, 50);
    doc.fillColor(TEXT).fontSize(22).text('INVOICE', left, 50, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
      .text(`Invoice no. ${d.invoiceNumber}`, left, 80, { width, align: 'right' })
      .text(`Issue date: ${fmtDate(d.issuedAt)}`, { width, align: 'right' });
    doc.moveTo(left, 120).lineTo(right, 120).strokeColor('#e3e1f0').lineWidth(1).stroke();

    // From / Bill to
    const colY = 135;
    const half = width / 2;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('FROM', left, colY).text('BILL TO', left + half, colY);
    doc.fillColor(TEXT).font('Helvetica').fontSize(10);
    const from = [INVOICE_ISSUER.name, ...INVOICE_ISSUER.addressLines, INVOICE_ISSUER.email, INVOICE_ISSUER.website];
    if (INVOICE_ISSUER.trn) from.push(`TRN: ${INVOICE_ISSUER.trn}`);
    doc.text(from.join('\n'), left, colY + 15, { width: half - 10 });
    const to = [d.customer.name, d.customer.company, d.customer.email, d.customer.country].filter(Boolean) as string[];
    doc.text(to.join('\n'), left + half, colY + 15, { width: half });

    // Line items
    let y = 245;
    doc.rect(left, y, width, 24).fill(PURPLE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
      .text('Description', left + 10, y + 7).text('Amount', left, y + 7, { width: width - 10, align: 'right' });
    y += 34;
    doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(d.line, left + 10, y, { width: width - 130 });
    doc.text(fmtMoney(d.amount, d.currency), left, y, { width: width - 10, align: 'right' });
    let lineBottom = doc.y;
    if (d.periodStart && d.periodEnd) {
      doc.fillColor(MUTED).fontSize(9).text(`Service period: ${fmtDate(d.periodStart)} – ${fmtDate(d.periodEnd)}`, left + 10, lineBottom + 2);
      lineBottom = doc.y;
    }
    y = lineBottom + 12;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e3e1f0').stroke();

    // Totals
    y += 12;
    const vat = INVOICE_ISSUER.vatRate ? Math.round(d.amount * INVOICE_ISSUER.vatRate * 100) / 100 : 0;
    const rows: [string, string][] = [['Subtotal', fmtMoney(d.amount, d.currency)]];
    if (vat) rows.push([`VAT (${INVOICE_ISSUER.vatRate * 100}%)`, fmtMoney(vat, d.currency)]);
    for (const [k, v] of rows) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(k, left + half, y, { width: half / 2 });
      doc.fillColor(TEXT).text(v, left, y, { width: width - 10, align: 'right' });
      y += 18;
    }
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(12).text('Total paid', left + half, y, { width: half / 2 });
    doc.text(fmtMoney(d.amount + vat, d.currency), left, y, { width: width - 10, align: 'right' });
    y += 30;

    // Payment
    doc.roundedRect(left, y, width, 46, 4).fill('#f6f4fd');
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10).text('PAID — bank transfer', left + 12, y + 9);
    doc.font('Helvetica').fillColor(MUTED).fontSize(9)
      .text(d.transactionRef ? `Transfer reference: ${d.transactionRef}` : 'Payment received and confirmed by LogicMate.', left + 12, y + 25);

    // Footer
    doc.fillColor(MUTED).fontSize(8.5).text(
      `Questions about this invoice: ${INVOICE_ISSUER.email} · ${INVOICE_ISSUER.website}`,
      left, doc.page.height - 70, { width, align: 'center' },
    );
    doc.end();
  });
}
