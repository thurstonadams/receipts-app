// CSV export — build a spreadsheet of receipts and open the share sheet.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Receipt } from '../types';

function esc(v: string | number | undefined | null): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(receipts: Receipt[]): string {
  const header = [
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
  return [header, ...rows].join('\n');
}

export async function exportReceiptsCsv(
  receipts: Receipt[],
  filename: string = 'receipts.csv'
): Promise<void> {
  const csv = buildCsv(receipts);
  const uri = (FileSystem.cacheDirectory ?? '') + filename;
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
