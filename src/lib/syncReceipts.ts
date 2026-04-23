import { supabase } from './supabase';
import { Receipt } from '../types';

type Row = {
  id: string; user_id: string; entity_id: string; vendor: string; date: string;
  total: number; currency: string; payment: string; category: string;
  category_code: string | null; project: string | null; notes: string;
  status: string; thumb_tone: number; photo_uri: string | null;
  created_at: number; updated_at: number;
};

function toRow(r: Receipt, userId: string): Row {
  return {
    id: r.id, user_id: userId, entity_id: r.entityId, vendor: r.vendor,
    date: r.date, total: r.total, currency: r.currency, payment: r.payment,
    category: r.category, category_code: r.categoryCode ?? null,
    project: r.project ?? null, notes: r.notes, status: r.status,
    thumb_tone: r.thumbTone, photo_uri: r.photoUri ?? null,
    created_at: r.createdAt, updated_at: r.updatedAt,
  };
}

function fromRow(row: Row): Receipt {
  return {
    id: row.id, entityId: row.entity_id, vendor: row.vendor, date: row.date,
    total: row.total, currency: row.currency, payment: row.payment,
    category: row.category, categoryCode: row.category_code ?? undefined,
    project: row.project ?? undefined, notes: row.notes,
    status: row.status as Receipt['status'], thumbTone: row.thumb_tone,
    photoUri: row.photo_uri ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function pushReceipt(receipt: Receipt, userId: string): Promise<void> {
  const { error } = await supabase.from('receipts').upsert(toRow(receipt, userId));
  if (error) throw error;
}

export async function deleteReceiptRemote(id: string): Promise<void> {
  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAllReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => fromRow(r as Row));
}
