// Receipt reader — shared by `inbound-email` (live) and `receipt-reader`
// (backfill). Pure TypeScript: no Deno or Node APIs, so it runs in the edge
// runtime AND under jest. Network access is injected (`fetchImpl`).
//
// Why this exists (2026-09-24): every forwarded email was filed with the
// forwarder ("Thurston Adams") as vendor, $0.00 when the amount sat in a PDF
// or was written in euros, and USD regardless of currency. 22 of 22 yellow
// cards had that root cause.

export const CATEGORIES = [
  'Meals & Entertainment', 'Travel', 'Vehicle & Fuel', 'Office Supplies',
  'Shipping', 'Utilities', 'Professional Services', 'Software & Subscriptions',
  'Marketing', 'Rent & Facilities', 'Other',
] as const;

export const CATEGORY_CODES: Record<string, string> = {
  'Meals & Entertainment': '6200', 'Travel': '6210', 'Vehicle & Fuel': '6220',
  'Office Supplies': '6300', 'Shipping': '6310', 'Utilities': '6400',
  'Professional Services': '6500', 'Software & Subscriptions': '6600',
  'Marketing': '6700', 'Rent & Facilities': '6800', 'Other': '6999',
};

// People who forward receipts. Never a vendor.
export const FORWARDER_NAMES = ['thurston adams', 'thurston', 'adams thurston'];
export const FORWARDER_EMAILS = [
  'thurstonadams@msn.com', 'thurston@xfix.tech', 'thurston@xmotion.io',
  'thurston.adams@kalyaniaftermarket.com',
];

export interface Attachment { name: string; contentType: string; base64: string }

export interface ReaderInput {
  subject: string;
  fromName?: string;
  fromEmail?: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt?: string;            // ISO timestamp of the email we received
  attachments?: Attachment[];     // PDFs and images only are sent to the model
}

export interface Extraction {
  is_receipt: boolean;
  vendor: string | null;
  date: string | null;            // YYYY-MM-DD, the purchase/charge date
  total: number | null;           // amount actually paid, in `currency`
  currency: string | null;        // ISO 4217
  category: string | null;        // one of CATEGORIES
  confidence: 'high' | 'medium' | 'low';
  note: string | null;            // short reason when something is uncertain
  book_hint?: 'xfix' | 'kai' | 'personal' | null; // AI's guess at the book; trips override it
  service_date?: string | null;   // YYYY-MM-DD first night / travel date for hotels, flights, trains
}

export interface Decision {
  status: 'ready' | 'needs-review';
  reviewReason: string | null;
  vendor: string;
  date: string;
  total: number;
  currency: string;
  category: string;
  categoryCode: string;
}

// ── Subject / forwarded-header helpers ─────────────────────────────────────

/** Strip FW:/Fwd:/TR:/RE: prefixes (any number, any case). */
export function cleanSubject(subject: string): string {
  let s = (subject ?? '').trim();
  const re = /^(?:(?:fw|fwd|tr|re|aw|wg)\s*:\s*)/i;
  while (re.test(s)) s = s.replace(re, '').trim();
  return s;
}

export function isForwarderName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return false;
  return FORWARDER_NAMES.includes(n);
}

export function isForwarderEmail(email: string | null | undefined): boolean {
  return FORWARDER_EMAILS.includes((email ?? '').toLowerCase().trim());
}

/**
 * Pull the ORIGINAL sender out of a forwarded email body. Handles Outlook
 * ("From: … Sent: …"), French Outlook ("De : … Envoyé : …"), Gmail/Apple
 * ("---------- Forwarded message ---------" / "Begin forwarded message:").
 * Returns the first From line that is not one of Thurston's own addresses.
 */
export function parseForwardedFrom(text: string): { name: string | null; email: string | null } | null {
  const lines = (text ?? '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\*/g, '').trim();
    const m = line.match(/^(?:from|de|von|da)\s*:\s*(.+)$/i);
    if (!m) continue;
    const value = m[1].trim();
    const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;
    let name = value.replace(/<[^>]*>/g, '').replace(/\[mailto:[^\]]*\]/gi, '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
      .replace(/["']/g, '').trim();
    if (!name) name = email ? email.split('@')[1].split('.')[0] : '';
    if (isForwarderEmail(email) || isForwarderName(name)) continue;
    if (!name && !email) continue;
    return { name: name || null, email };
  }
  return null;
}

/** Minimal HTML → text, keeping line breaks so header blocks survive. */
export function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&euro;/gi, '€').replace(/&#8364;/g, '€')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// ── Currency cross-check (deterministic) ──────────────────────────────────

const CURRENCY_MARKERS: [RegExp, string][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/₹|\bINR\b|\bRs\.?(?=\s|\d)/i, 'INR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bUSD\b|US\$|\$/i, 'USD'],
];

/**
 * Which currencies are printed right next to `total` in the text?
 * Looks at every occurrence of the amount (12.34 / 12,34 / 1,234.56 /
 * 1 234,56) and the ~8 characters either side. Empty = no evidence.
 */
export function currencyEvidence(text: string, total: number): string[] {
  if (!text || !(total > 0)) return [];
  const fixed = total.toFixed(2);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const variants = new Set([
    fixed, `${int},${dec}`, `${grouped}.${dec}`,
    `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`,
    `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`,
  ]);
  const found = new Set<string>();
  for (const v of variants) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(v, from);
      if (i < 0) break;
      from = i + v.length;
      // Skip when the match is part of a longer number (e.g. 152.73).
      const before = text[i - 1] ?? ' ';
      const after = text[i + v.length] ?? ' ';
      if (/[0-9]/.test(before) || /[0-9]/.test(after)) continue;
      const window = text.slice(Math.max(0, i - 8), i) + ' ' + text.slice(i + v.length, i + v.length + 8);
      for (const [re, code] of CURRENCY_MARKERS) {
        if (re.test(window)) { found.add(code); break; }
      }
    }
  }
  return [...found].sort();
}

// ── Model call ─────────────────────────────────────────────────────────────

export function buildPrompt(input: ReaderInput, bodyText: string, forwardedFrom: { name: string | null; email: string | null } | null): string {
  return `You read receipts for an expense app. Extract the purchase from this email and its attachments.

Rules:
- The email was usually FORWARDED by the account owner, Thurston Adams. He is NEVER the vendor. The vendor is the merchant that charged the money (e.g. "Uber Eats", "SNCF", "Conrad Pune", "JW Marriott New Delhi", "Snowflake", "Supabase").
- total = the amount actually charged/paid, as a plain number (e.g. 63.19). Read PDFs and images. European formats like "63,19 €" mean 63.19. Never convert currencies.
- currency = ISO 4217 code of that amount (EUR, USD, INR, GBP...). "€" = EUR, "₹"/"Rs" = INR, "$" = USD unless the text says otherwise. Use the symbol printed NEXT TO the total. If no symbol or code is printed next to it, set confidence "medium" and note "currency not shown".
- date = the date the card was CHARGED (YYYY-MM-DD), NOT the date the email was forwarded. For prepaid bookings (HotelTonight, Booking.com, flights, trains booked ahead) that is the booking/payment date, NOT the stay or travel date. For hotel folios settled at checkout, use the checkout date.
- For delivery/ride apps the vendor is the app ("Uber Eats", "Uber"), not the restaurant.
- category = exactly one of: ${CATEGORIES.join(' | ')}.
- is_receipt = false for login links, password resets, marketing, booking enquiries, or itineraries without a price.
- service_date = for hotels, flights, trains and car rentals: the first night / travel date (YYYY-MM-DD), even if paid earlier. Otherwise null.
- book_hint = "personal" for groceries, personal shopping, streaming, gym or anything clearly private; "xfix" for software, SaaS, cloud hosting, AI tools or domains; otherwise null. Never guess "kai". Food delivery and rides → null.
- confidence = "high" only if vendor, date, total and currency are all clearly stated. Otherwise "medium" or "low", and say what is uncertain in note (max 12 words).

Reply with ONE JSON object and nothing else:
{"is_receipt":true,"vendor":"...","date":"YYYY-MM-DD","total":0.00,"currency":"EUR","category":"...","confidence":"high","note":null,"service_date":null,"book_hint":null}

Subject: ${cleanSubject(input.subject)}
Forwarded from original sender: ${forwardedFrom ? `${forwardedFrom.name ?? ''} <${forwardedFrom.email ?? ''}>` : 'unknown'}
Email received: ${input.receivedAt ?? 'unknown'}

Email body (truncated):
${bodyText.slice(0, 12000)}`;
}

/** Parse the model's reply. Tolerates prose or code fences around the JSON. */
export function parseExtraction(reply: string): Extraction | null {
  const m = (reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const num = (v: unknown) => {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.,-]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, ''));
      return isFinite(n) ? n : null;
    }
    return null;
  };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const date = str(o.date);
  const currency = str(o.currency)?.toUpperCase() ?? null;
  const category = str(o.category);
  const conf = str(o.confidence);
  return {
    is_receipt: o.is_receipt !== false,
    vendor: str(o.vendor),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    total: num(o.total),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    category: category && (CATEGORIES as readonly string[]).includes(category) ? category : null,
    confidence: conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low',
    note: str(o.note),
    service_date: ((): string | null => {
      const d = str(o.service_date);
      return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    })(),
    book_hint: ((): Extraction['book_hint'] => {
      const b = str(o.book_hint)?.toLowerCase();
      // "kai" is only ever set by a trip, never by the model.
      return b === 'xfix' || b === 'personal' ? b : null;
    })(),
  };
}

export interface ModelOptions {
  apiKey: string;
  model: string;
  fetchImpl: (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;
}

export async function extractWithClaude(input: ReaderInput, opts: ModelOptions): Promise<{ extraction: Extraction | null; raw: string; forwardedFrom: ReturnType<typeof parseForwardedFrom>; evidence: string[] }> {
  const bodyText = input.textBody?.trim() ? input.textBody : htmlToText(input.htmlBody ?? '');
  const forwardedFrom = parseForwardedFrom(bodyText);
  const content: Record<string, unknown>[] = [];
  for (const a of input.attachments ?? []) {
    if (a.contentType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } });
    } else if (/^image\/(jpeg|png|gif|webp)$/.test(a.contentType)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: a.contentType, data: a.base64 } });
    }
  }
  content.push({ type: 'text', text: buildPrompt(input, bodyText, forwardedFrom) });

  const res = await opts.fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: opts.model, max_tokens: 400, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw: string = data?.content?.[0]?.text ?? '';
  const extraction = parseExtraction(raw);
  const evidence = extraction?.total
    ? currencyEvidence(`${cleanSubject(input.subject)}\n${bodyText}`, extraction.total)
    : [];
  return { extraction, raw, forwardedFrom, evidence };
}

// ── Decision ───────────────────────────────────────────────────────────────

/**
 * Turn an extraction into the fields we store. A receipt is auto-filed
 * (status 'ready') only when every field is present and the model is highly
 * confident. Otherwise it stays 'needs-review' WITH the reason shown on the
 * card. `fallback` supplies what we already knew (e.g. forwarded-from name).
 */
export function decide(
  ex: Extraction | null,
  fallback: { vendor: string; date: string; currency?: string; category?: string },
  evidence: string[] = [],
): Decision {
  const vendorRaw = ex?.vendor && !isForwarderName(ex.vendor) ? ex.vendor : null;
  const vendor = vendorRaw ?? (isForwarderName(fallback.vendor) ? '' : fallback.vendor);
  const date = ex?.date ?? fallback.date;
  const total = ex?.total && ex.total > 0 ? Math.round(ex.total * 100) / 100 : 0;
  // The printed symbol beats the model: exactly one currency next to the
  // amount → use it. Two different ones → a human decides.
  const printed = evidence.length === 1 ? evidence[0] : null;
  const currency = printed ?? ex?.currency ?? fallback.currency ?? 'USD';
  const category = ex?.category ?? fallback.category ?? 'Other';

  let reviewReason: string | null = null;
  if (!ex) reviewReason = 'Could not read this receipt';
  else if (!ex.is_receipt) reviewReason = 'Not a receipt?';
  else if (!vendor) reviewReason = 'Vendor not found';
  else if (!total) reviewReason = 'Amount not found';
  else if (!ex.date) reviewReason = 'Date not found';
  else if (evidence.length > 1) reviewReason = `Check currency: ${evidence.join(' or ')}?`;
  else if (!ex.currency && !printed) reviewReason = 'Currency unclear';
  else if (ex.confidence !== 'high') reviewReason = ex.note ? `Check: ${ex.note}` : 'Low confidence, please check';

  return {
    status: reviewReason ? 'needs-review' : 'ready',
    reviewReason,
    vendor: vendor || 'Unknown',
    date,
    total,
    currency,
    category,
    categoryCode: CATEGORY_CODES[category] ?? '6999',
  };
}
