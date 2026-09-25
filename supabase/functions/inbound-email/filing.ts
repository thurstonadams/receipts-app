// Filing rules — which book a receipt belongs to, whether it is billed to KAI,
// and whether it duplicates one we already have. Pure TypeScript (edge runtime
// + jest). Decided with Thurston 2026-09-24/25:
//   - AI picks the book; trips he enters in the app win for their dates;
//     the forwarding address only breaks ties.
//   - Uber "[Personal]" → Personal book, never billable — but only OUTSIDE a
//     trip: Thurston's Uber profile defaults to Personal, and the Aug 26
//     airport ride billed on KAI-2026-08 carries the tag (found 2026-09-25).
//   - Trips match on the service date (stay/travel) when there is one, so a
//     hotel prepaid in July for a September trip lands in the trip's book.
//   - Software/SaaS → xFix book, never billable to KAI (ruling 2026-09-24).
//   - KAI travel & meals are auto-tagged "Bill to KAI" (AI tag shown).
//   - Same vendor + same amount + same currency within 3 days → merge
//     (second one kept, linked as "also received"). Same vendor within 3 days
//     but a different currency → flag "Possible duplicate", never auto-merge.

export type Book = 'xfix' | 'kai' | 'personal';

export interface Trip {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD inclusive
  end_date: string;   // YYYY-MM-DD inclusive
  entity_id: Book;
}

export interface FilingInput {
  date: string;            // charge date YYYY-MM-DD
  serviceDate?: string | null; // stay/travel date for prepaid bookings
  subject: string;
  vendor: string;
  category: string;
  aiHint?: Book | null;    // from the reader
  addressBook: Book;       // from the To: address
}

const SOFTWARE_TOKENS = [
  'anthropic', 'openai', 'aws', 'amazon web services', 'github', 'vercel',
  'supabase', 'hostinger', 'postmark', 'netlify', 'cloudflare', 'sentry',
  'datadog', 'notion', 'linear', 'figma', 'resend', 'lovable', 'bright data',
  'brightdata', 'chatgpt', 'claude ai', 'snowflake', 'fly io', 'microsoft',
  'x ai', 'xai', 'google workspace', 'expo dev',
];

function norm(s: string): string {
  return ` ${(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function isSoftware(vendor: string, category: string): boolean {
  if (category === 'Software & Subscriptions') return true;
  const v = norm(vendor);
  return SOFTWARE_TOKENS.some(t => v.includes(` ${t} `));
}

export function uberProfileTag(subject: string): 'personal' | 'business' | null {
  if (/\[\s*personal\s*\]/i.test(subject ?? '')) return 'personal';
  if (/\[\s*business\s*\]/i.test(subject ?? '')) return 'business';
  return null;
}

/** The trip covering `date`; if several overlap, the shortest one wins. */
export function tripFor(date: string, trips: Trip[]): Trip | null {
  const hits = trips.filter(t => t.start_date <= date && date <= t.end_date);
  if (hits.length === 0) return null;
  const span = (t: Trip) => Date.parse(t.end_date) - Date.parse(t.start_date);
  return hits.sort((a, b) => span(a) - span(b))[0];
}

export function pickBook(input: FilingInput, trips: Trip[]): { book: Book; why: string } {
  if (isSoftware(input.vendor, input.category)) return { book: 'xfix', why: 'Software → xFix' };
  const trip = (input.serviceDate ? tripFor(input.serviceDate, trips) : null) ?? tripFor(input.date, trips);
  if (trip) return { book: trip.entity_id, why: `Trip: ${trip.name}` };
  if (uberProfileTag(input.subject) === 'personal') return { book: 'personal', why: 'Uber profile: Personal' };
  if (input.aiHint) return { book: input.aiHint, why: 'AI' };
  return { book: input.addressBook, why: 'Forwarding address' };
}

const AUTO_BILL_CATEGORIES = new Set(['Travel', 'Meals & Entertainment']);

/** KAI travel & meals are auto-tagged billable. Never software, never Personal. */
export function autoBillToKai(book: Book, category: string, vendor: string): boolean {
  return book === 'kai' && AUTO_BILL_CATEGORIES.has(category) && !isSoftware(vendor, category);
}

// ── Duplicates ──────────────────────────────────────────────────────────────

export interface DupCandidate {
  id: string;
  vendor: string;
  date: string;
  total: number;
  currency: string;
  duplicate_of?: string | null;
}

const VENDOR_STOPWORDS = new Set([
  'the', 'inc', 'llc', 'ltd', 'pbc', 'sa', 'sas', 'gmbh', 'hotel', 'hotels',
  'and', 'des', 'les', 'restaurant', 'receipts', 'receipt', 'pte', 'limited',
]);

function vendorTokens(v: string): Set<string> {
  return new Set(norm(v).trim().split(' ').filter(t => t.length >= 3 && !VENDOR_STOPWORDS.has(t)));
}

export function vendorsSimilar(a: string, b: string): boolean {
  const ta = vendorTokens(a), tb = vendorTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;
}

export type DupResult = { kind: 'same'; of: string } | { kind: 'possible'; of: string } | null;

/**
 * Compare a new receipt against existing ones (same user). Existing rows that
 * are themselves duplicates are ignored so chains always point at the primary.
 */
export function findDuplicate(c: DupCandidate, existing: DupCandidate[]): DupResult {
  let possible: string | null = null;
  for (const e of existing) {
    if (e.id === c.id || e.duplicate_of) continue;
    if (!e.date || !c.date || dayDiff(e.date, c.date) > 3) continue;
    if (!vendorsSimilar(e.vendor, c.vendor)) continue;
    const sameCcy = (e.currency || 'USD').toUpperCase() === (c.currency || 'USD').toUpperCase();
    if (sameCcy && Math.abs(Number(e.total) - Number(c.total)) <= 0.01 && Number(c.total) > 0) {
      return { kind: 'same', of: e.id };
    }
    if (!sameCcy && possible === null) possible = e.id;
  }
  return possible ? { kind: 'possible', of: possible } : null;
}
