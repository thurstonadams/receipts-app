import {
  periodStartFor, periodEndFor, periodLabel, reportIdFor,
  receiptsForPeriod, totalCentsOf, computeStats, fmtCents, assembleReport,
} from './reports';
import { Receipt, Report } from '../types';

function r(id: string, date: string, total: number, billable: 'kai' | null = 'kai'): Receipt {
  return {
    id, entityId: 'xfix', vendor: 'Test', date, total,
    currency: 'USD', payment: 'Visa', category: 'Software & Subscriptions',
    notes: '', status: 'ready', thumbTone: 0,
    billableTo: billable,
    createdAt: 0, updatedAt: 0,
  };
}

describe('period helpers', () => {
  test('periodStartFor returns first of month', () => {
    expect(periodStartFor('2026-05-14')).toBe('2026-05-01');
    expect(periodStartFor('2026-01-31')).toBe('2026-01-01');
    expect(periodStartFor('2026-12-01')).toBe('2026-12-01');
  });

  test('periodEndFor returns last of month — handles 28/29/30/31 day months', () => {
    expect(periodEndFor('2026-02-15')).toBe('2026-02-28');
    expect(periodEndFor('2024-02-15')).toBe('2024-02-29'); // leap year
    expect(periodEndFor('2026-04-01')).toBe('2026-04-30');
    expect(periodEndFor('2026-12-25')).toBe('2026-12-31');
  });

  test('periodLabel formats month name + year', () => {
    expect(periodLabel('2026-05-01')).toBe('May 2026');
    expect(periodLabel('2026-01-01')).toBe('January 2026');
  });

  test('reportIdFor formats KAI-YYYY-MM', () => {
    expect(reportIdFor('kai', '2026-05-01')).toBe('KAI-2026-05');
    expect(reportIdFor('kai', '2026-01-01')).toBe('KAI-2026-01');
  });
});

describe('receiptsForPeriod', () => {
  test('filters by billableTo and date range', () => {
    const all = [
      r('1', '2026-05-01', 10),
      r('2', '2026-05-15', 20),
      r('3', '2026-04-30', 30),       // out of period
      r('4', '2026-06-01', 40),       // out of period
      r('5', '2026-05-20', 50, null), // not billable
    ];
    const result = receiptsForPeriod(all, 'kai', '2026-05-01', '2026-05-31');
    expect(result.map(x => x.id)).toEqual(['1', '2']);
  });

  test('sorts by date ascending', () => {
    const all = [
      r('a', '2026-05-20', 10),
      r('b', '2026-05-01', 20),
      r('c', '2026-05-15', 30),
    ];
    const result = receiptsForPeriod(all, 'kai', '2026-05-01', '2026-05-31');
    expect(result.map(x => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('totalCentsOf', () => {
  test('sums in cents to dodge float drift', () => {
    const all = [r('1', '2026-05-01', 0.1), r('2', '2026-05-02', 0.2)];
    expect(totalCentsOf(all)).toBe(30);
  });

  test('rounds correctly for tricky decimals', () => {
    const all = [r('1', '2026-05-01', 28.05), r('2', '2026-05-02', 142.10)];
    expect(totalCentsOf(all)).toBe(17015);
  });
});

describe('computeStats', () => {
  function rep(id: string, status: Report['status'], totalCents: number, opts: Partial<Report> = {}): Report {
    return {
      id, client: 'kai',
      periodStart: '2026-04-01', periodEnd: '2026-04-30',
      status, invoiceNumber: id,
      totalCents, lineCount: 0,
      createdAt: 0, updatedAt: 0,
      ...opts,
    };
  }

  test('thisPeriod equals provided value (live preview)', () => {
    const stats = computeStats([], 32400, '2026-05-15');
    expect(stats.thisPeriod).toBe(32400);
  });

  test('awaiting payment sums sent reports', () => {
    const reports = [
      rep('a', 'sent', 10000),
      rep('b', 'sent', 20000),
      rep('c', 'paid', 30000, { invoiceDate: '2026-03-01' }),
    ];
    const stats = computeStats(reports, 0, '2026-05-15');
    expect(stats.awaiting).toBe(30000);
  });

  test('paid YTD sums paid reports for current year only', () => {
    const reports = [
      rep('a', 'paid', 10000, { invoiceDate: '2026-03-01' }),
      rep('b', 'paid', 20000, { invoiceDate: '2026-04-01' }),
      rep('c', 'paid', 50000, { invoiceDate: '2025-12-01' }), // prev year
    ];
    const stats = computeStats(reports, 0, '2026-05-15');
    expect(stats.paidYtd).toBe(30000);
  });

  test('overdue counts only sent reports past due date', () => {
    const reports = [
      rep('a', 'sent', 10000, { dueDate: '2026-04-30' }), // overdue
      rep('b', 'sent', 20000, { dueDate: '2026-06-30' }), // not yet due
      rep('c', 'paid', 30000, { dueDate: '2026-04-30' }), // paid → not overdue
    ];
    const stats = computeStats(reports, 0, '2026-05-15');
    expect(stats.overdue).toBe(10000);
    expect(stats.awaiting).toBe(30000); // both sent count toward awaiting
  });
});

describe('fmtCents', () => {
  test('formats USD with thousands separator and 2 decimals', () => {
    expect(fmtCents(0)).toBe('$0.00');
    expect(fmtCents(2805)).toBe('$28.05');
    expect(fmtCents(324718)).toBe('$3,247.18');
  });
});

describe('assembleReport', () => {
  test('assembles report id, period, total, lines from receipts', () => {
    const receipts = [
      r('a', '2026-05-01', 10),
      r('b', '2026-05-15', 20.05),
      r('c', '2026-06-01', 99), // out of period
      r('d', '2026-05-20', 5, null), // not billable
    ];
    const { report, lines } = assembleReport(receipts, 'kai', '2026-05-01');
    expect(report.id).toBe('KAI-2026-05');
    expect(report.periodEnd).toBe('2026-05-31');
    expect(report.totalCents).toBe(3005);
    expect(report.lineCount).toBe(2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ receiptId: 'a', lineNo: 1, totalCents: 1000 });
    expect(lines[1]).toMatchObject({ receiptId: 'b', lineNo: 2, totalCents: 2005 });
  });
});
