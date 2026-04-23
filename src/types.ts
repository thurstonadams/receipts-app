// Domain types for xFix Receipts

export type ReceiptStatus = 'processing' | 'needs-review' | 'ready' | 'synced';

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

export type Screen =
  | 'home'
  | 'capture'
  | 'batch'
  | 'review'
  | 'sync'
  | 'report';
