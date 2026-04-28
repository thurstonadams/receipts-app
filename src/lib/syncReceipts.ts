import { supabase } from './supabase';
import { Receipt } from '../types';

type Row = {
  id: string; user_id: string; entity_id: string; vendor: string; date: string;
  total: number; currency: string; payment: string; category: string;
  category_code: string | null; project: string | null; notes: string;
  status: string; thumb_tone: number; photo_uri: string | null;
  photo_path: string | null;
  source: string | null;
  source_email: string | null;
  source_subject: string | null;
  attachment_path: string | null;
  billable_to: string | null;
  created_at: number; updated_at: number;
};

function toRow(r: Receipt, userId: string): Row {
  return {
    id: r.id, user_id: userId, entity_id: r.entityId, vendor: r.vendor,
    date: r.date, total: r.total, currency: r.currency, payment: r.payment,
    category: r.category, category_code: r.categoryCode ?? null,
    project: r.project ?? null, notes: r.notes, status: r.status,
    thumb_tone: r.thumbTone,
    // photo_uri is a device-local file:// path; never sync it (null in cloud).
    // photo_path is the Supabase Storage object key and is the durable pointer.
    photo_uri: null,
    photo_path: r.photoPath ?? null,
    source: r.source ?? 'capture',
    source_email: r.sourceEmail ?? null,
    source_subject: r.sourceSubject ?? null,
    attachment_path: r.attachmentPath ?? null,
    billable_to: r.billableTo ?? null,
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
    // photo_uri from cloud is ignored — it'd be a stale file:// path from
    // another device. photoPath is how we find the photo in Storage.
    photoUri: undefined,
    photoPath: row.photo_path ?? undefined,
    source: (row.source === 'email' ? 'email' : 'capture'),
    sourceEmail: row.source_email ?? undefined,
    sourceSubject: row.source_subject ?? undefined,
    attachmentPath: row.attachment_path ?? undefined,
    billableTo: row.billable_to === 'kai' ? 'kai' : null,
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

export type RemoteChange =
  | { kind: 'upsert'; receipt: Receipt }
  | { kind: 'delete'; id: string };

/**
 * Subscribe to postgres_changes on receipts for a given user. Callback fires
 * for every insert/update/delete coming in over the Supabase Realtime socket.
 * Returns the unsubscribe function.
 *
 * The table must be in the supabase_realtime publication for this to work;
 * running `alter publication supabase_realtime add table public.receipts;`
 * once in the dashboard enables it.
 */
export function subscribeToReceipts(
  userId: string,
  onChange: (change: RemoteChange) => void,
): () => void {
  const channel = supabase
    .channel(`receipts:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'receipts',
        filter: `user_id=eq.${userId}`,
      },
      (payload: { eventType: string; new: unknown; old: unknown }) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          onChange({ kind: 'upsert', receipt: fromRow(payload.new as Row) });
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string }).id;
          if (oldId) onChange({ kind: 'delete', id: oldId });
        }
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
