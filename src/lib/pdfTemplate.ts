// Invoice PDF template (HTML).
//
// expo-print renders an HTML string to PDF on the device. The HTML below
// mirrors the Kalyani Aftermarket → KAI invoice template the user
// uploaded — letterhead, Bill-To grid, line item table, total, payment
// instructions footer.
//
// Style notes:
//   - System sans (San Francisco / Helvetica fallback) for everything
//   - tabular-nums on all amount cells for column alignment
//   - 0.5pt rules in lieu of decorative borders
//   - 1in margins via @page; renders cleanly on US Letter
import { Report, ReportLine } from '../types';
import { fmtCents } from './reports';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildInvoiceHtml(report: Report, lines: ReportLine[]): string {
  const issued = report.invoiceDate ?? new Date().toISOString().slice(0, 10);
  const due = report.dueDate
    ?? new Date(new Date(issued + 'T00:00:00').getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const rows = lines.map(l => `
    <tr>
      <td class="d">${escapeHtml(fmtDate(l.date))}</td>
      <td class="v">${escapeHtml(l.vendor)}</td>
      <td class="c">${escapeHtml(l.category)}</td>
      <td class="n">${escapeHtml(l.notes ?? '')}</td>
      <td class="a">$${(l.totalCents / 100).toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.id)}</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #09090B;
    font-size: 10pt;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .letterhead { padding-bottom: 14px; border-bottom: 0.5pt solid #09090B; }
  .brand { font-size: 14pt; font-weight: 500; letter-spacing: -0.3px; margin: 0; }
  .brandSub { font-size: 9pt; color: #71717A; margin: 2px 0 0; }

  .grid { display: flex; gap: 24px; margin-top: 18px; }
  .gridCol { flex: 1; }
  .gridColRight { flex: 1; text-align: right; }
  .eyebrow {
    font-size: 7pt; font-weight: 500; letter-spacing: 1px;
    text-transform: uppercase; color: #71717A; margin: 0;
  }
  .billTo { font-size: 10pt; font-weight: 500; margin: 3px 0 0; }
  .invNum { font-size: 10pt; font-weight: 500; margin: 3px 0 0; font-variant-numeric: tabular-nums; }
  .addrLine { font-size: 9pt; color: #52525B; margin: 0; line-height: 1.4; }

  table.lines {
    width: 100%; border-collapse: collapse; margin-top: 24px;
    font-variant-numeric: tabular-nums;
  }
  table.lines th {
    font-size: 7pt; font-weight: 500; letter-spacing: 1px;
    text-transform: uppercase; color: #71717A;
    text-align: left; padding: 6px 4px;
    border-top: 0.5pt solid #09090B; border-bottom: 0.5pt solid rgba(9,9,11,0.16);
  }
  table.lines th.a, table.lines td.a { text-align: right; }
  table.lines td {
    padding: 8px 4px; vertical-align: top;
    border-bottom: 0.5pt solid rgba(9,9,11,0.08);
    font-size: 9.5pt;
  }
  td.d { width: 80px; color: #52525B; }
  td.v { font-weight: 500; }
  td.c { color: #52525B; width: 140px; }
  td.n { color: #52525B; }
  td.a { width: 80px; font-weight: 500; }

  .totalRow {
    display: flex; justify-content: space-between; align-items: baseline;
    border-top: 1pt solid #09090B; padding-top: 12px; margin-top: 4px;
  }
  .totalLabel { font-size: 11pt; font-weight: 500; }
  .totalAmount {
    font-size: 13pt; font-weight: 500; letter-spacing: -0.3px;
    font-variant-numeric: tabular-nums;
  }

  .footer {
    margin-top: 36px; padding-top: 18px;
    border-top: 0.5pt solid rgba(9,9,11,0.16);
    font-size: 8.5pt; color: #52525B; line-height: 1.5;
  }
  .footer .heading {
    font-size: 7pt; font-weight: 500; letter-spacing: 1px;
    text-transform: uppercase; color: #71717A; margin: 12px 0 2px;
  }
  .footer .heading:first-child { margin-top: 0; }
  .footer p { margin: 0; }
</style>
</head>
<body>

  <div class="letterhead">
    <p class="brand">Kalyani Aftermarket</p>
    <p class="brandSub">166 E 96th St Suite 3B · New York, NY 10128</p>
  </div>

  <div class="grid">
    <div class="gridCol">
      <p class="eyebrow">Bill to</p>
      <p class="billTo">KAI</p>
      <p class="addrLine">508 Carthage Street</p>
      <p class="addrLine">Sanford, NC 27330</p>
    </div>
    <div class="gridColRight">
      <p class="eyebrow">Invoice</p>
      <p class="invNum">${escapeHtml(report.id)}</p>
      <p class="addrLine">Issued ${escapeHtml(fmtDate(issued))}</p>
      <p class="addrLine">Due ${escapeHtml(fmtDate(due))}</p>
    </div>
  </div>

  <table class="lines">
    <thead>
      <tr>
        <th>Date</th>
        <th>Vendor</th>
        <th>Category</th>
        <th>Notes</th>
        <th class="a">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #71717A;">No line items.</td></tr>'}
    </tbody>
  </table>

  <div class="totalRow">
    <span class="totalLabel">Total</span>
    <span class="totalAmount">${escapeHtml(fmtCents(report.totalCents))}</span>
  </div>

  <div class="footer">
    <p class="heading">Make payment to</p>
    <p>XMOTION VEHICLE TECHNOLOGIES LLC</p>
    <p>6855 E. Camelback Rd. Unit 5012</p>
    <p>Scottsdale, AZ 85251</p>

    <p class="heading">Bank</p>
    <p>Bank of America &middot; Account 4570 5190 6421</p>
    <p>ACH Routing 122101706</p>

    <p class="heading">Wire (US dollars)</p>
    <p>Wire 026009593 &middot; SWIFT BOFAUS3N</p>
    <p>Bank of America N.A., 222 Broadway, New York NY 10038</p>

    <p class="heading">Wire (foreign currency)</p>
    <p>Wire 026009593 &middot; SWIFT BOFAUS6S</p>
    <p>Bank of America N.A., 555 California St, San Francisco CA 94104</p>
  </div>

</body>
</html>`;
}
