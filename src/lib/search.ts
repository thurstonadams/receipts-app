// Receipt search: text fields, amounts and dates. Pure, so it is unit-tested.
//
// Amounts: "58.30", "58,30" (French keyboard), "€58.30", "58.3", "58".
// Dates:   "2026-07-29", "2026-07", "Jul 29", "july 29", "29 jul", "juillet".
import { Receipt } from '../types';

const MONTHS: string[][] = [
  ['jan', 'january', 'janvier', 'janv'],
  ['feb', 'february', 'fevrier', 'février', 'fev', 'fév'],
  ['mar', 'march', 'mars'],
  ['apr', 'april', 'avril', 'avr'],
  ['may', 'mai'],
  ['jun', 'june', 'juin'],
  ['jul', 'july', 'juillet', 'juil'],
  ['aug', 'august', 'aout', 'août'],
  ['sep', 'sept', 'september', 'septembre'],
  ['oct', 'october', 'octobre'],
  ['nov', 'november', 'novembre'],
  ['dec', 'december', 'decembre', 'décembre', 'déc'],
];

function monthOf(word: string): number | null {
  const w = word.replace(/\.$/, '');
  for (let i = 0; i < MONTHS.length; i++) if (MONTHS[i].includes(w)) return i + 1;
  return null;
}

/** Parses "58.30", "58,30", "€ 58.30" → { cents, hasDecimals }. Null if not an amount. */
function parseAmount(q: string): { cents: number; hasDecimals: boolean } | null {
  const s = q.replace(/[€$£₹\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return { cents: Math.round(parseFloat(s) * 100), hasDecimals: s.includes('.') };
}

/** Parses month/day queries. Null if the query is not a date. */
function parseDate(q: string): { iso?: string; month?: number; day?: number } | null {
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(q)) return { iso: q };
  const parts = q.split(/[\s/]+/).filter(Boolean);
  if (parts.length === 1) {
    const m = monthOf(parts[0]);
    return m ? { month: m } : null;
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    const ma = monthOf(a), mb = monthOf(b);
    if (ma && /^\d{1,2}$/.test(b)) return { month: ma, day: Number(b) };
    if (mb && /^\d{1,2}$/.test(a)) return { month: mb, day: Number(a) };
  }
  return null;
}

function amountScore(r: Receipt, q: string): number {
  const a = parseAmount(q);
  if (!a) return 0;
  const cents = Math.round(r.total * 100);
  if (a.hasDecimals) return cents === a.cents ? 90 : 0;
  // Whole number: 58 finds 58.00–58.99, never 158.
  return Math.floor(cents / 100) === a.cents / 100 ? 60 : 0;
}

function dateScore(r: Receipt, q: string): number {
  const d = parseDate(q);
  if (!d || !r.date) return 0;
  if (d.iso) return r.date.startsWith(d.iso) ? 70 : 0;
  const [, mm, dd] = r.date.split('-').map(Number);
  if (d.month !== mm) return 0;
  if (d.day === undefined) return 35;
  return d.day === dd ? 70 : 0;
}

export function scoreMatch(r: Receipt, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const vendor = (r.vendor ?? '').toLowerCase();
  if (vendor && vendor.startsWith(q)) return 100;
  if (vendor && vendor.includes(q)) return 80;
  const byNumber = Math.max(amountScore(r, q), dateScore(r, q));
  if (byNumber > 0) return byNumber;
  if (!vendor && 'no vendor yet'.includes(q)) return 45;
  if ((r.category ?? '').toLowerCase().includes(q)) return 50;
  if ((r.project ?? '').toLowerCase().includes(q)) return 40;
  if ((r.payment ?? '').toLowerCase().includes(q)) return 30;
  if ((r.notes ?? '').toLowerCase().includes(q)) return 20;
  if ((r.categoryCode ?? '').toLowerCase().includes(q)) return 15;
  return 0;
}

/** Newest receipt date first; ties broken by most recently edited. */
export function sortNewestFirst(list: readonly Receipt[]): Receipt[] {
  return [...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt);
}

/** Empty query → every receipt, newest first. Otherwise best match first. */
export function searchReceipts(list: readonly Receipt[], query: string): Receipt[] {
  const q = query.trim();
  if (!q) return sortNewestFirst(list);
  return list
    .map(r => ({ r, score: scoreMatch(r, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.r.date ?? '').localeCompare(a.r.date ?? '') || b.r.updatedAt - a.r.updatedAt)
    .map(x => x.r);
}
