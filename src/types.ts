// Domain types for xFix Receipts

export type ReceiptStatus = 'processing' | 'needs-review' | 'ready' | 'synced';

export type ReceiptSource = 'capture' | 'email';

// Independent of which book a receipt lives in, a receipt can be tagged
// "billable to KAI" — meaning it's a passthrough expense that Kalyani
// Aftermarket will invoice to KAI on the next monthly report. Today only
// 'kai' is supported; the column is text so future clients can add to the
// enum without a schema change.
export type BillableTo = 'kai';

export interface Receipt {
  id: string;
  entityId: string;
  vendor: string;
  date: string; // ISO yyyy-mm-dd
  total: number;
  currency: string; // USD / EUR / GBP
  payment: string;
  category: string;
  categoryCode?: string;
  project?: string;
  notes: string;
  status: ReceiptStatus;
  thumbTone: number; // 0-360 hue for placeholder thumb
  photoUri?: string; // local FileSystem path if captured (device-only, not synced)
  photoPath?: string; // Supabase Storage object key (<userId>/<receiptId>.jpg) if uploaded
  source?: ReceiptSource; // 'capture' (default) or 'email' for inbound-email-sourced receipts
  sourceEmail?: string;   // From: address when source='email'
  sourceSubject?: string; // Subject line when source='email'
  attachmentPath?: string; // receipt-attachments bucket key for the original .pdf/.eml/.html
  billableTo?: BillableTo | null; // tag for passthrough invoicing
  createdAt: number;
  updatedAt: number;
}

export interface Entity {
  id: string;
  name: string;
  short: string;
  type: string;
  mark: string; // 2-char badge text
  color: string; // hex
  platform: string;
  platformColor: string;
  ein: string | null;
}

export interface Category {
  name: string;
  code: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  type: 'card' | 'cash' | 'ach';
}

export interface Project {
  id: string;
  name: string;
}

// ─── Reports / passthrough invoices ─────────────────────────────────────

export type ReportStatus = 'draft' | 'ready' | 'sent' | 'paid' | 'overdue' | 'void';

export interface Report {
  id: string;                 // e.g. 'KAI-2026-05'
  client: 'kai';              // matches Receipt.billableTo
  periodStart: string;        // ISO yyyy-mm-dd, inclusive
  periodEnd: string;          // ISO yyyy-mm-dd, inclusive
  status: ReportStatus;
  invoiceNumber: string;      // human-friendly; same as id today
  invoiceDate?: string;       // ISO yyyy-mm-dd; set on send
  dueDate?: string;           // ISO yyyy-mm-dd
  recipientEmail?: string;
  ccEmail?: string;
  totalCents: number;         // cents — dodge float drift
  lineCount: number;
  pdfPath?: string;           // 'reports' bucket key — <userId>/<reportId>.pdf
  sentAt?: number;            // ms epoch
  paidAt?: number;            // ms epoch
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// One row per (report, receipt). Snapshots the receipt at billing time so a
// later edit to the underlying receipt doesn't silently mutate a sent invoice.
export interface ReportLine {
  reportId: string;
  receiptId: string;
  lineNo: number;
  date: string;               // ISO yyyy-mm-dd
  vendor: string;
  category: string;
  notes: string;
  totalCents: number;
}

export type Screen =
  | 'home'
  | 'capture'
  | 'batch'
  | 'review'
  | 'sync'
  | 'report'
  | 'search'
  | 'forwarding'
  | 'reports'         // KAI invoice list
  | 'period-detail'   // single-report view
  | 'send-sheet'      // pre-flight email composer
  | 'organize';       // bulk Bill-to-KAI sweep
