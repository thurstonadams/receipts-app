// CSV export — build a spreadsheet of receipts and open the share sheet.
//
// A few quality-of-life details:
// * UTF-8 BOM so Excel/Google Sheets parse non-ASCII vendor names correctly.
// * CRLF line endings (RFC 4180 compliance + better Windows Excel behaviour).
// * Receipt id column so rows stay traceable back to the source after export.
// * Timestamped filename (YYYY-MM-DDTHHMM) to avoid same-day overwrites.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Receipt } from '../types';

const UTF8_BOM = '\uFEFF';
const CRLF = '\r\n';

function esc(v: string | number | undefined | null): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(receipts: Receipt[]): string {
  const header = [
    'Receipt ID',
    'Date',
    'Vendor',
    'Category',
    'Code',
    'Project',
    'Payment',
    'Total',
    'Currency',
    'Status',
    'Notes',
  ].join(',');
  const rows = receipts.map(r =>
    [
      r.id,
      r.date,
      r.vendor,
      r.category,
      r.categoryCode ?? '',
      r.project ?? '',
      r.payment,
      r.total.toFixed(2),
      r.currency,
      r.status,
      r.notes,
    ].map(esc).join(',')
  );
  return UTF8_BOM + [header, ...rows].join(CRLF) + CRLF;
}

function timestampSlug(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function defaultExportFilename(entityId: string): string {
  return `${entityId}-receipts-${timestampSlug()}.csv`;
}

export async function exportReceiptsCsv(
  receipts: Receipt[],
  filename?: string,
): Promise<void> {
  const name = filename ?? 'receipts.csv';
  const csv = buildCsv(receipts);
  const uri = (FileSystem.cacheDirectory ?? '') + name;
  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export receipts',
      UTI: 'public.comma-separated-values-text',
    });
  }
}
