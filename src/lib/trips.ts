// Trips: date ranges Thurston enters that decide which book a receipt goes
// in (e.g. India, Aug 15–26 → KAI). The email import applies the same rule
// server-side (supabase/functions/_shared/filing.ts); here it sets the
// default book for new captures.
import { supabase } from './supabase';
import { Trip } from '../types';

type Row = {
  id: string; user_id: string; name: string; start_date: string; end_date: string;
  entity_id: string; notes: string; created_at: number; updated_at: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BOOKS = ['xfix', 'kai', 'personal'] as const;

function fromRow(r: Row): Trip {
  return {
    id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date,
    entityId: (BOOKS as readonly string[]).includes(r.entity_id) ? (r.entity_id as Trip['entityId']) : 'xfix',
    notes: r.notes ?? '', createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** The trip covering `date` (inclusive). Overlaps → the shortest wins, as on the server. */
export function tripFor(date: string, trips: Trip[]): Trip | null {
  const hits = trips.filter(t => t.startDate <= date && date <= t.endDate);
  if (hits.length === 0) return null;
  const span = (t: Trip) => Date.parse(t.endDate) - Date.parse(t.startDate);
  return [...hits].sort((a, b) => span(a) - span(b))[0];
}

/** Keep only well-formed trips (the offline cache can be stale or corrupt). */
export function sanitizeTrips(raw: unknown): Trip[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is Trip =>
    !!t && typeof t === 'object' &&
    typeof (t as Trip).id === 'string' && typeof (t as Trip).name === 'string' &&
    typeof (t as Trip).startDate === 'string' && typeof (t as Trip).endDate === 'string' &&
    (BOOKS as readonly string[]).includes((t as Trip).entityId) &&
    validateTrip(t as Trip) === null);
}

/** Returns an error message, or null when the trip can be saved. */
export function validateTrip(t: Pick<Trip, 'name' | 'startDate' | 'endDate'>): string | null {
  if (!t.name.trim()) return 'Give the trip a name.';
  if (!ISO.test(t.startDate) || isNaN(Date.parse(t.startDate))) return 'Start date must be YYYY-MM-DD.';
  if (!ISO.test(t.endDate) || isNaN(Date.parse(t.endDate))) return 'End date must be YYYY-MM-DD.';
  if (t.endDate < t.startDate) return 'End date is before the start date.';
  return null;
}

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => fromRow(r as Row));
}

export async function saveTrip(t: Trip, userId: string): Promise<void> {
  const row: Row = {
    id: t.id, user_id: userId, name: t.name.trim(), start_date: t.startDate, end_date: t.endDate,
    entity_id: t.entityId, notes: t.notes, created_at: t.createdAt, updated_at: t.updatedAt,
  };
  const { error } = await supabase.from('trips').upsert(row);
  if (error) throw error;
}

export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from('trips').delete().eq('id', id);
  if (error) throw error;
}
