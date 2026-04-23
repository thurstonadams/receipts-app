import { buildCsv, defaultExportFilename } from './exportCsv';
import { Receipt } from '../types';

function r(partial: Partial<Receipt> = {}): Receipt {
  const now = Date.now();
  return {
    id: 'r_test',
    entityId: 'xfix',
    vendor: 'Vendor',
    date: '2026-04-24',
    total: 10,
    currency: 'USD',
    payment: 'Visa',
    category: 'Other',
    notes: '',
    status: 'ready',
    thumbTone: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('buildCsv', () => {
  test('includes UTF-8 BOM and CRLF line endings', () => {
    const out = buildCsv([r()]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain('\r\n');
    expect(out.endsWith('\r\n')).toBe(true);
  });

  test('header row is stable', () => {
    const out = buildCsv([r()]);
    const header = out.replace(/^\uFEFF/, '').split('\r\n')[0];
    expect(header).toBe('Receipt ID,Date,Vendor,Category,Code,Project,Payment,Total,Currency,Status,Notes');
  });

  test('includes the receipt id as the first data column', () => {
    const out = buildCsv([r({ id: 'r_abc' })]);
    const firstDataRow = out.replace(/^\uFEFF/, '').split('\r\n')[1];
    expect(firstDataRow.startsWith('r_abc,')).toBe(true);
  });

  test('escapes commas, quotes, and newlines', () => {
    const out = buildCsv([r({
      vendor: 'Big, Co "Ltd"',
      notes: 'line1\nline2',
    })]);
    expect(out).toContain('"Big, Co ""Ltd"""');
    expect(out).toContain('"line1\nline2"');
  });

  test('empty optional fields round-trip as empty strings', () => {
    const out = buildCsv([r({ categoryCode: undefined, project: undefined })]);
    const firstDataRow = out.replace(/^\uFEFF/, '').split('\r\n')[1];
    // Code, Project columns (5th and 6th 0-indexed) should be empty.
    const cols = firstDataRow.split(',');
    expect(cols[4]).toBe('');
    expect(cols[5]).toBe('');
  });

  test('total is formatted to two decimals', () => {
    const out = buildCsv([r({ total: 1 })]);
    expect(out).toContain(',1.00,');
  });
});

describe('defaultExportFilename', () => {
  test('uses entity id and includes a timestamp slug', () => {
    const name = defaultExportFilename('xfix');
    expect(name).toMatch(/^xfix-receipts-\d{4}-\d{2}-\d{2}T\d{4}\.csv$/);
  });

  test('different entities produce distinct filenames', () => {
    const a = defaultExportFilename('xfix');
    const b = defaultExportFilename('kai');
    expect(a.startsWith('xfix-')).toBe(true);
    expect(b.startsWith('kai-')).toBe(true);
  });
});
