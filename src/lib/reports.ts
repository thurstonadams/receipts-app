// Reports / passthrough invoices.
//
// Receipts tagged `billableTo === 'kai'` get assembled into monthly
// invoices that bill KAI on Kalyani Aftermarket letterhead. This module
// owns the data model around that:
//   - period helpers (compute period_start/end from a date)
//   - id generation (KAI-2026-05)
//   - in-memory assembly of a Report from a list of Receipts
//   - Supabase round-trip (upsert report + report_lines, fetch list)
//
// The cardinal rule: receipts are NEVER mutated when they're billed.
// Traceability lives in `report_receipts` rows, which carry a snapshot
// of each receipt at billing time.
import { Receipt, Report, ReportLine, ReportStatus } from '../types';
import { supabase } from './supabase';

// ─── Period helpers ──────────────────────────────────────────────────────

/** Returns yyyy-mm-dd of the first day of the month a given date falls in. */
export function periodStartFor(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Returns yyyy-mm-dd of the last day of the month a given date falls in. */
export function periodEndFor(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  // Day 0 of next month = last day of this month.
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, '0');
  const day = String(last.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "May 2026" — the human label for a period_start date. */
export function periodLabel(periodStartIso: string): string {
  const d = new Date(periodStartIso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "KAI-2026-05" — the canonical id for a period. Stable per month per client. */
export function reportIdFor(client: 'kai', periodStartIso: string): string {
  const d = new Date(periodStartIso + 'T00:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${client.toUpperCase()}-${y}-${m}`;
}

// ─── In-memory assembly ──────────────────────────────────────────────────

/** Returns receipts tagged for `client` whose date falls within the period. */
export function receiptsForPeriod(
  receipts: Receipt[],
  client: 'kai',
  periodStartIso: string,
  periodEndIso: string,
): Receipt[] {
  return receipts
    .filter(r => r.billableTo === client && r.date >= periodStartIso && r.date <= periodEndIso)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

/** Sum of receipts.total in cents. Avoids float drift. */
export function totalCentsOf(receipts: Receipt[]): number {
  return receipts.reduce((acc, r) => acc + Math.round(r.total * 100), 0);
}

/** Build the in-memory Report + Lines from a list of receipts. */
export function assembleReport(
  receipts: Receipt[],
  client: 'kai',
  periodStartIso: string,
): { report: Report; lines: ReportLine[] } {
  const periodEndIso = periodEndFor(periodStartIso);
  const inPeriod = receiptsForPeriod(receipts, client, periodStartIso, periodEndIso);
  const id = reportIdFor(client, periodStartIso);
  const now = Date.now();
  const totalCents = totalCentsOf(inPeriod);
  const report: Report = {
    id,
    client,
    periodStart: periodStartIso,
    periodEnd: periodEndIso,
    status: 'draft',
    invoiceNumber: id,
    totalCents,
    lineCount: inPeriod.length,
    createdAt: now,
    updatedAt: now,
  };
  const lines: ReportLine[] = inPeriod.map((r, i) => ({
    reportId: id,
    receiptId: r.id,
    lineNo: i + 1,
    date: r.date,
    vendor: r.vendor,
    category: r.category,
    notes: r.notes,
    totalCents: Math.round(r.total * 100),
  }));
  return { report, lines };
}

// ─── Supabase round-trip ─────────────────────────────────────────────────

type ReportRow = {
  id: string; user_id: string; client: string;
  period_start: string; period_end: string; status: string;
  invoice_number: string; invoice_date: string | null; due_date: string | null;
  recipient_email: string | null; cc_email: string | null;
  total_cents: number; line_count: number;
  pdf_path: string | null; sent_at: string | null; paid_at: string | null;
  notes: string | null;
  created_at: string; updated_at: string;
};

type ReportLineRow = {
  report_id: string; receipt_id: string; user_id: string;
  line_no: number;
  snap_date: string | null; snap_vendor: string | null;
  snap_category: string | null; snap_notes: string | null;
  snap_total_cents: number | null;
};

function reportFromRow(row: ReportRow): Report {
  return {
    id: row.id,
    client: 'kai',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status as ReportStatus,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    recipientEmail: row.recipient_email ?? undefined,
    ccEmail: row.cc_email ?? undefined,
    totalCents: row.total_cents,
    lineCount: row.line_count,
    pdfPath: row.pdf_path ?? undefined,
    sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
    paidAt: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function reportToRow(report: Report, userId: string): Partial<ReportRow> {
  return {
    id: report.id,
    user_id: userId,
    client: report.client,
    period_start: report.periodStart,
    period_end: report.periodEnd,
    status: report.status,
    invoice_number: report.invoiceNumber,
    invoice_date: report.invoiceDate ?? null,
    due_date: report.dueDate ?? null,
    recipient_email: report.recipientEmail ?? null,
    cc_email: report.ccEmail ?? null,
    total_cents: report.totalCents,
    line_count: report.lineCount,
    pdf_path: report.pdfPath ?? null,
    sent_at: report.sentAt ? new Date(report.sentAt).toISOString() : null,
    paid_at: report.paidAt ? new Date(report.paidAt).toISOString() : null,
    notes: report.notes ?? null,
  };
}

function lineFromRow(row: ReportLineRow): ReportLine {
  return {
    reportId: row.report_id,
    receiptId: row.receipt_id,
    lineNo: row.line_no,
    date: row.snap_date ?? '',
    vendor: row.snap_vendor ?? '',
    category: row.snap_category ?? '',
    notes: row.snap_notes ?? '',
    totalCents: row.snap_total_cents ?? 0,
  };
}

function lineToRow(line: ReportLine, userId: string): ReportLineRow {
  return {
    report_id: line.reportId,
    receipt_id: line.receiptId,
    user_id: userId,
    line_no: line.lineNo,
    snap_date: line.date,
    snap_vendor: line.vendor,
    snap_category: line.category,
    snap_notes: line.notes,
    snap_total_cents: line.totalCents,
  };
}

/** List all reports for the current user, newest period first. */
export async function fetchReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('period_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => reportFromRow(r as ReportRow));
}

/** Fetch the line items for a specific report. */
export async function fetchReportLines(reportId: string): Promise<ReportLine[]> {
  const { data, error } = await supabase
    .from('report_receipts')
    .select('*')
    .eq('report_id', reportId)
    .order('line_no', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => lineFromRow(r as ReportLineRow));
}

/** Upsert the report row + replace its lines atomically-ish. */
export async function saveReport(
  report: Report,
  lines: ReportLine[],
  userId: string,
): Promise<void> {
  const { error: rErr } = await supabase
    .from('reports')
    .upsert(reportToRow(report, userId));
  if (rErr) throw rErr;

  // Replace all lines: simplest correct strategy. Lines are tiny rows.
  const { error: dErr } = await supabase
    .from('report_receipts')
    .delete()
    .eq('report_id', report.id);
  if (dErr) throw dErr;

  if (lines.length > 0) {
    const { error: iErr } = await supabase
      .from('report_receipts')
      .insert(lines.map(l => lineToRow(l, userId)));
    if (iErr) throw iErr;
  }
}

/** Mark a report sent and timestamp it. Idempotent. */
export async function markReportSent(reportId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('reports')
    .update({ status: 'sent', sent_at: now, invoice_date: now.slice(0, 10) })
    .eq('id', reportId);
  if (error) throw error;
}

/** Mark a report paid. */
export async function markReportPaid(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) throw error;
}

/** Find the report a given receipt was billed on, if any. */
export async function findReportForReceipt(receiptId: string): Promise<Report | null> {
  const { data: link, error: linkErr } = await supabase
    .from('report_receipts')
    .select('report_id')
    .eq('receipt_id', receiptId)
    .limit(1)
    .maybeSingle();
  if (linkErr || !link) return null;
  const { data: rep, error: repErr } = await supabase
    .from('reports')
    .select('*')
    .eq('id', (link as { report_id: string }).report_id)
    .limit(1)
    .maybeSingle();
  if (repErr || !rep) return null;
  return reportFromRow(rep as ReportRow);
}

// ─── Stat helpers ────────────────────────────────────────────────────────

/** Format cents as USD with two decimals and grouping. */
export function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/** Compute dashboard stats from a list of reports + the in-period preview. */
export function computeStats(
  reports: Report[],
  currentPeriodCents: number,
  todayIso: string,
): { thisPeriod: number; awaiting: number; paidYtd: number; overdue: number } {
  const yearPrefix = todayIso.slice(0, 4);
  let awaiting = 0;
  let paidYtd = 0;
  let overdue = 0;
  for (const r of reports) {
    if (r.status === 'sent') {
      awaiting += r.totalCents;
      if (r.dueDate && r.dueDate < todayIso) overdue += r.totalCents;
    }
    if (r.status === 'paid' && r.invoiceDate?.startsWith(yearPrefix)) {
      paidYtd += r.totalCents;
    }
  }
  return { thisPeriod: currentPeriodCents, awaiting, paidYtd, overdue };
}
