// KAI billing rules — pure, no network.
//
// The receipts app is the CAPTURE layer for KAI reimbursables. The invoice
// itself is built at month-end by the `kai-monthly-invoice` skill, which reads
// `kai_export.receipts_kai` (billable_to = 'kai') and converts every non-USD
// line at the ECB reference rate for the charge date. So the app must:
//   1. only let genuinely billable receipts be tagged "Bill to KAI", and
//   2. never add amounts in different currencies together.
//
// Ruling (Thurston, 2026-09-24): software subscriptions are NOT billable to KAI.
import { Receipt } from '../types';

export const KAI_NON_BILLABLE_CATEGORIES = new Set(['Software & Subscriptions']);

// Software / SaaS vendors that must never be passed through, even when a
// receipt is miscategorised (e.g. email ingest files AWS under "Other").
// Matched as whole words against the normalised vendor name.
const SOFTWARE_VENDOR_TOKENS = [
  'anthropic', 'openai', 'aws', 'amazon web services', 'github', 'vercel',
  'supabase', 'hostinger', 'postmark', 'netlify', 'cloudflare', 'sentry',
  'datadog', 'notion', 'linear', 'figma', 'resend', 'lovable',
  'bright data', 'brightdata', 'chatgpt', 'claude ai',
  // Not bare 'claude': "Chez Claude" is a restaurant.
  // Not 'expo': trade shows ("AAPEX Expo") are billable. Expo the SaaS is
  // filed under Software & Subscriptions by the email ingest dictionary.
];

function normalise(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export type Billability = { ok: true } | { ok: false; reason: string };

export function kaiBillability(r: Pick<Receipt, 'category' | 'vendor'>): Billability {
  if (KAI_NON_BILLABLE_CATEGORIES.has(r.category)) {
    return { ok: false, reason: 'Software subscriptions are not billable to KAI.' };
  }
  const v = normalise(r.vendor ?? '');
  if (SOFTWARE_VENDOR_TOKENS.some(t => v.includes(` ${t} `))) {
    return { ok: false, reason: 'Software vendor — not billable to KAI.' };
  }
  return { ok: true };
}

/**
 * Starting position of the "Bill to KAI" toggle on the Review screen.
 * A KAI-book receipt nobody has touched yet starts ON (the toggle is visible;
 * the user can switch it off). "Untouched" = no billing decision yet
 * (undefined), or an email-ingested row still exactly as it arrived
 * (null + updatedAt === createdAt). Once the user has saved it as not
 * billable, that sticks. Software never defaults on.
 */
export function defaultBillToKai(
  r: Pick<Receipt, 'entityId' | 'billableTo' | 'source' | 'createdAt' | 'updatedAt' | 'category' | 'vendor'> & Pick<Partial<Receipt>, 'reviewReason'>,
): boolean {
  if (r.billableTo === 'kai') return true;
  // Might already be on an invoice as another receipt: never pre-tick it.
  if (isPossibleDuplicate(r)) return false;
  if (r.entityId !== 'kai' || !isKaiBillable(r)) return false;
  if (r.billableTo === undefined) return true;
  return r.source === 'email' && r.updatedAt === r.createdAt;
}

export function isPossibleDuplicate(r: Pick<Partial<Receipt>, 'reviewReason'>): boolean {
  return (r.reviewReason ?? '').startsWith('Possible duplicate');
}

export function isKaiBillable(r: Pick<Receipt, 'category' | 'vendor'>): boolean {
  return kaiBillability(r).ok;
}

/** Cents per currency. Never mixes currencies. Blank currency counts as USD. */
export function subtotalsByCurrency(receipts: Pick<Receipt, 'total' | 'currency'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of receipts) {
    const ccy = (r.currency || 'USD').toUpperCase();
    out[ccy] = (out[ccy] ?? 0) + Math.round(r.total * 100);
  }
  return out;
}

/** "USD 1,861.97 · EUR 418.80" — for places that must show a mixed period. */
export function fmtSubtotals(subtotals: Record<string, number>): string {
  const keys = Object.keys(subtotals).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
  if (keys.length === 0) return 'USD 0.00';
  return keys
    .map(k => `${k} ${(subtotals[k] / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ');
}

/**
 * KAI-tagged, billable receipts dated before `periodStartIso` that are not on
 * any billed report. These are the carry-overs the month-end skill surfaces
 * (e.g. the June McDonald's EUR 13.65).
 */
export function unbilledCarryOvers(
  receipts: Receipt[],
  billedReceiptIds: Set<string>,
  periodStartIso: string,
): Receipt[] {
  return receipts
    .filter(r => r.billableTo === 'kai' && isKaiBillable(r) && r.date < periodStartIso && !billedReceiptIds.has(r.id))
    .sort((a, b) => a.date.localeCompare(b.date));
}
