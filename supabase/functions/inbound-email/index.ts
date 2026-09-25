// supabase/functions/inbound-email/index.ts
//
// Webhook receiver for Postmark Inbound. Wires emails sent to
//   receipts@xfix.tech              -> xFix entity
//   receipts@xmotionaxles.com       -> KAI entity
//   receipts+personal@xfix.tech     -> Personal entity (sub-addressing)
// into rows in public.receipts.
//
// v2 (2026-09-24): extraction now goes through the shared AI reader
// (./reader.ts): it reads the forwarded email AND its PDF/image, finds the
// ORIGINAL merchant (never the forwarder), the charge date, the amount and
// its currency, and files the receipt as 'ready' when everything is clear.
// Anything unclear stays 'needs-review' with review_reason saying why.
// If the AI call fails, the old regex path runs and the row is flagged.
//
// v4 (2026-09-25): filing (./filing.ts). The book is picked by rules, in order:
// software → xFix; a trip covering the charge/stay date → the trip's book;
// Uber "[Personal]" → Personal; the AI's hint; the To: address. A "+tag"
// address (receipts+personal@…) is an explicit choice and always wins.
// KAI travel & meals are tagged "Bill to KAI" automatically. The same charge
// arriving twice is linked (duplicate_of) and hidden; a same-vendor receipt
// in another currency within 3 days is flagged "Possible duplicate".
//
// Pipeline:
//   1. Verify shared-secret token in the URL.
//   2. Look up the From: address in public.email_inbound_senders (allowlist).
//   3. Parse the To: address — base address picks the entity, "+tag" overrides.
//   4. AI reader (fallback: regex) → vendor / date / total / currency / category.
//   5. Upload image → receipts bucket; PDF / HTML body → receipt-attachments.
//   6. Insert the row (+ audit row when AI filled it).
//
// Required Supabase secrets:
//   INBOUND_WEBHOOK_SECRET   - shared secret matched against ?token= on the URL
//   ANTHROPIC_API_KEY        - AI reader
//   READER_MODEL             - optional; defaults to claude-haiku-4-5-20251001

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractWithClaude, decide, parseForwardedFrom, htmlToText, type Attachment } from "./reader.ts";
import { pickBook, autoBillToKai, findDuplicate, type Book, type Trip, type DupCandidate } from "./filing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_WEBHOOK_SECRET = Deno.env.get("INBOUND_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const READER_MODEL = Deno.env.get("READER_MODEL") ?? "claude-haiku-4-5-20251001";

// ── Routing config ─────────────────────────────────────────────────────────
const ENTITY_BY_ADDRESS: Record<string, string> = {
  "receipts@xfix.tech": "xfix",
  "receipts@xmotionaxles.com": "kai",
};

const TAG_TO_ENTITY: Record<string, string> = {
  "personal": "personal",
  "kai":      "kai",
  "xfix":     "xfix",
};

// ── Fallback auto-categorize (only used if the AI reader fails) ────────────
const VENDOR_CATEGORY: Record<string, { category: string; code: string }> = {
  "anthropic":     { category: "Software & Subscriptions", code: "6600" },
  "openai":        { category: "Software & Subscriptions", code: "6600" },
  "github":        { category: "Software & Subscriptions", code: "6600" },
  "aws":           { category: "Software & Subscriptions", code: "6600" },
  "google":        { category: "Software & Subscriptions", code: "6600" },
  "microsoft":     { category: "Software & Subscriptions", code: "6600" },
  "vercel":        { category: "Software & Subscriptions", code: "6600" },
  "supabase":      { category: "Software & Subscriptions", code: "6600" },
  "stripe":        { category: "Software & Subscriptions", code: "6600" },
  "notion":        { category: "Software & Subscriptions", code: "6600" },
  "linear":        { category: "Software & Subscriptions", code: "6600" },
  "figma":         { category: "Software & Subscriptions", code: "6600" },
  "expo":          { category: "Software & Subscriptions", code: "6600" },
  "apple":         { category: "Software & Subscriptions", code: "6600" },
  "shell":         { category: "Vehicle & Fuel",           code: "6220" },
  "chevron":       { category: "Vehicle & Fuel",           code: "6220" },
  "exxon":         { category: "Vehicle & Fuel",           code: "6220" },
  "uber":          { category: "Travel",                   code: "6210" },
  "lyft":          { category: "Travel",                   code: "6210" },
  "delta":         { category: "Travel",                   code: "6210" },
  "united":        { category: "Travel",                   code: "6210" },
  "hilton":        { category: "Travel",                   code: "6210" },
  "marriott":      { category: "Travel",                   code: "6210" },
  "fedex":         { category: "Shipping",                 code: "6310" },
  "ups":           { category: "Shipping",                 code: "6310" },
  "dhl":           { category: "Shipping",                 code: "6310" },
  "staples":       { category: "Office Supplies",          code: "6300" },
  "amazon":        { category: "Office Supplies",          code: "6300" },
};

// ── Types ──────────────────────────────────────────────────────────────────
interface PostmarkAttachment {
  Name: string;
  Content: string;       // base64
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInboundPayload {
  FromName?: string;
  From?: string;
  Subject?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  ToFull?: { Email: string; Name: string }[];
  Attachments?: PostmarkAttachment[];
  MessageID?: string;
  RawEmail?: string;
}

// ── Entry point ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders() });
  }

  // 1. Shared-secret check
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (!INBOUND_WEBHOOK_SECRET || token !== INBOUND_WEBHOOK_SECRET) {
    console.warn("inbound-email: bad token");
    return new Response("unauthorized", { status: 401, headers: corsHeaders() });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = await req.json();
  } catch (e) {
    console.warn("inbound-email: bad json", e);
    return new Response("bad request", { status: 400, headers: corsHeaders() });
  }

  // 2. Sender allowlist
  const fromEmail = (payload.From ?? "").toLowerCase().trim();
  const fromName = payload.FromName ?? "";
  const subject = payload.Subject ?? "(no subject)";
  const textBody = payload.TextBody ?? stripHtml(payload.HtmlBody ?? "");
  const dateHeader = payload.Date ? new Date(payload.Date) : new Date();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: senderRow } = await supabase
    .from("email_inbound_senders")
    .select("user_id")
    .eq("email", fromEmail)
    .maybeSingle();

  if (!senderRow) {
    console.warn(`inbound-email: rejecting unauthorized sender ${fromEmail}`);
    return new Response("dropped: sender not in allowlist", { status: 200, headers: corsHeaders() });
  }
  const userId = senderRow.user_id as string;

  // 3. Resolve entity from To: address
  const toEmail = (payload.ToFull?.[0]?.Email ?? "").toLowerCase().trim();
  const route = parseToAddress(toEmail);
  if (!route.entityId) {
    console.warn(`inbound-email: unrecognized recipient ${toEmail}`);
    return new Response("dropped: unrecognized recipient", { status: 200, headers: corsHeaders() });
  }

  // 4. Extraction — AI reader first, regex fallback.
  const receiptId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const regexVendor = extractVendor(fromName, fromEmail);
  const regexTotal = extractTotal(textBody, subject);
  const regexDate = extractDate(textBody, subject) ?? toISODate(dateHeader);

  const readerAttachments: Attachment[] = (payload.Attachments ?? [])
    .filter(a => a.ContentType === "application/pdf" || /^image\/(jpeg|png|gif|webp)$/.test(a.ContentType ?? ""))
    .slice(0, 4)
    .map(a => ({ name: a.Name, contentType: a.ContentType, base64: a.Content }));

  let fields: {
    vendor: string; date: string; total: number; currency: string; category: string;
    categoryCode: string; status: "ready" | "needs-review"; reviewReason: string | null; ai: boolean;
    serviceDate: string | null; bookHint: Book | null;
  };
  let aiRaw = "";

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    const { extraction, raw, evidence } = await extractWithClaude({
      subject,
      fromName,
      fromEmail,
      textBody: payload.TextBody ?? undefined,
      htmlBody: payload.HtmlBody ?? undefined,
      receivedAt: dateHeader.toISOString(),
      attachments: readerAttachments,
    }, { apiKey: ANTHROPIC_API_KEY, model: READER_MODEL, fetchImpl: fetch as any });
    aiRaw = raw;
    const d = decide(extraction, { vendor: regexVendor, date: regexDate }, evidence);
    fields = { ...d, ai: true, serviceDate: extraction?.service_date ?? null, bookHint: extraction?.book_hint ?? null };
  } catch (e) {
    console.warn("inbound-email: AI reader failed, using regex fallback", e);
    // Even without AI, never file the forwarder as vendor: use the original
    // sender from the forwarded header block when there is one.
    const fwd = parseForwardedFrom(payload.TextBody || htmlToText(payload.HtmlBody ?? ""));
    const fallbackVendor = fwd?.name ? cleanVendorName(fwd.name) : regexVendor;
    const cat = autoCategorize(fallbackVendor);
    fields = {
      vendor: fallbackVendor || "Unknown",
      date: regexDate,
      total: regexTotal.total ?? 0,
      currency: regexTotal.currency || "USD",
      category: cat?.category ?? "Other",
      categoryCode: cat?.code ?? "6999",
      status: "needs-review",
      reviewReason: "AI reader unavailable, please check",
      ai: false,
      serviceDate: null,
      bookHint: null,
    };
  }

  // 4b. Filing — book, KAI billing, duplicates. Never blocks the import.
  let book = route.entityId as Book;
  let bookWhy = route.explicit ? "Address tag" : "Forwarding address";
  let duplicateOf: string | null = null;
  let possibleDuplicate = false;
  try {
    if (!route.explicit) {
      const { data: trips } = await supabase.from("trips")
        .select("id,name,start_date,end_date,entity_id").eq("user_id", userId);
      const pick = pickBook({
        date: fields.date, serviceDate: fields.serviceDate, subject, vendor: fields.vendor,
        category: fields.category, aiHint: fields.bookHint, addressBook: route.entityId as Book,
      }, (trips ?? []) as Trip[]);
      book = pick.book; bookWhy = pick.why;
    }
    const dayMs = 86400000, t = Date.parse(fields.date + "T00:00:00Z");
    if (fields.total > 0 && !isNaN(t)) {
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const { data: near } = await supabase.from("receipts")
        .select("id,vendor,date,total,currency,duplicate_of")
        .eq("user_id", userId).gte("date", iso(t - 3 * dayMs)).lte("date", iso(t + 3 * dayMs))
        .order("created_at", { ascending: true });
      const dup = findDuplicate(
        { id: receiptId, vendor: fields.vendor, date: fields.date, total: fields.total, currency: fields.currency },
        ((near ?? []) as DupCandidate[]).map(r => ({ ...r, total: Number(r.total) })),
      );
      if (dup?.kind === "same") {
        duplicateOf = dup.of;
      } else if (dup?.kind === "possible") {
        const other = (near ?? []).find((r: any) => r.id === dup.of) as any;
        possibleDuplicate = true;
        fields.status = "needs-review";
        // Always shown, first: the app keys "never pre-tick Bill to KAI" on it.
        const dupText = `Possible duplicate of ${other?.vendor ?? "another receipt"} ${other?.date ?? ""} (${other?.currency ?? ""} ${other?.total ?? ""})`.trim();
        fields.reviewReason = fields.reviewReason ? `${dupText} · ${fields.reviewReason}` : dupText;
      }
    }
  } catch (e) {
    console.warn("inbound-email: filing step failed, keeping address book", e);
  }
  // Never auto-bill anything that might already be on an invoice.
  const billableTo = fields.ai && !duplicateOf && !possibleDuplicate && autoBillToKai(book, fields.category, fields.vendor) ? "kai" : null;

  // 5. Upload attachments
  let photoPath: string | null = null;
  let attachmentPath: string | null = null;
  const thumbTone = Math.floor(Math.random() * 360);

  const imgAttachment = (payload.Attachments ?? []).find(a => a.ContentType?.startsWith("image/"));
  if (imgAttachment) {
    try {
      const path = `${userId}/${receiptId}.jpg`;
      const bytes = base64Decode(imgAttachment.Content);
      const { error } = await supabase.storage.from("receipts").upload(path, bytes, {
        contentType: imgAttachment.ContentType,
        upsert: true,
      });
      if (!error) photoPath = path;
    } catch (e) {
      console.warn("inbound-email: image upload failed", e);
    }
  }

  const pdfAttachment = (payload.Attachments ?? []).find(a => a.ContentType === "application/pdf");
  if (pdfAttachment) {
    try {
      const path = `${userId}/${receiptId}.pdf`;
      const bytes = base64Decode(pdfAttachment.Content);
      const { error } = await supabase.storage.from("receipt-attachments").upload(path, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (!error) attachmentPath = path;
    } catch (e) {
      console.warn("inbound-email: pdf upload failed", e);
    }
  }

  if (!attachmentPath && (payload.HtmlBody || textBody)) {
    try {
      const path = `${userId}/${receiptId}.html`;
      const html = payload.HtmlBody ?? `<pre>${escapeHtml(textBody)}</pre>`;
      const { error } = await supabase.storage.from("receipt-attachments").upload(path, html, {
        contentType: "text/html",
        upsert: true,
      });
      if (!error) attachmentPath = path;
    } catch (e) {
      console.warn("inbound-email: html upload failed", e);
    }
  }

  // 6. Insert receipt row
  const now = Date.now();
  const row = {
    id: receiptId,
    user_id: userId,
    entity_id: book,
    vendor: fields.vendor,
    date: fields.date,
    total: fields.total,
    currency: fields.currency,
    payment: "",
    category: fields.category,
    category_code: fields.categoryCode,
    project: null,
    notes: subject,
    status: fields.status,
    review_reason: duplicateOf ? null : fields.reviewReason,
    ai_extracted: fields.ai,
    billable_to: billableTo,
    duplicate_of: duplicateOf,
    thumb_tone: thumbTone,
    photo_uri: null,
    photo_path: photoPath,
    attachment_path: attachmentPath,
    source: "email",
    source_email: fromEmail,
    source_subject: subject,
    created_at: now,
    updated_at: now,
  };
  const { error: insertErr } = await supabase.from("receipts").insert(row);

  if (insertErr) {
    console.error("inbound-email: insert failed", insertErr);
    return new Response("insert failed", { status: 500, headers: corsHeaders() });
  }

  if (fields.ai) {
    const { error: auErr } = await supabase.from("receipt_ai_audit").insert({
      receipt_id: receiptId, user_id: userId, mode: "inbound", model: READER_MODEL,
      before: null, after: { vendor: fields.vendor, date: fields.date, total: fields.total, currency: fields.currency, category: fields.category, status: fields.status, review_reason: fields.reviewReason, service_date: fields.serviceDate, entity_id: book, book_why: bookWhy, billable_to: billableTo, duplicate_of: duplicateOf },
      raw_reply: aiRaw.slice(0, 4000),
    });
    if (auErr) console.warn("inbound-email: audit insert failed", auErr);
  }

  return new Response(
    JSON.stringify({ ok: true, id: receiptId, entity: book, why: bookWhy, billableTo, duplicateOf, vendor: fields.vendor, status: fields.status }),
    { status: 200, headers: { ...corsHeaders(), "content-type": "application/json" } },
  );
});

// ── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-webhook-token",
  };
}

function parseToAddress(addr: string): { entityId: string | null; baseAddress: string; explicit: boolean } {
  const m = addr.match(/^([^+@]+)(?:\+([^@]+))?@(.+)$/);
  if (!m) return { entityId: null, baseAddress: addr, explicit: false };
  const local = m[1];
  const tag = (m[2] ?? "").toLowerCase();
  const domain = m[3];
  const baseAddress = `${local}@${domain}`;
  if (tag && TAG_TO_ENTITY[tag]) {
    return { entityId: TAG_TO_ENTITY[tag], baseAddress, explicit: true };
  }
  return { entityId: ENTITY_BY_ADDRESS[baseAddress] ?? null, baseAddress, explicit: false };
}

function extractVendor(fromName: string, fromEmail: string): string {
  if (fromName && !fromName.includes("@")) {
    return cleanVendorName(fromName);
  }
  const domain = fromEmail.split("@")[1] ?? "";
  const head = domain.split(".")[0];
  if (head === "mail" || head === "email" || head === "noreply" || head === "no-reply") {
    const parts = domain.split(".");
    return cleanVendorName(parts[1] ?? head);
  }
  return cleanVendorName(head);
}

function cleanVendorName(s: string): string {
  return s
    .replace(/^"+|"+$/g, "")
    .replace(/,?\s*(Inc\.?|LLC|PBC|Corp\.?|Ltd\.?|GmbH|S\.?A\.?|Holdings)\.?$/i, "")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function extractTotal(text: string, subject: string): { total: number | null; currency: string } {
  const patterns: RegExp[] = [
    /total\s*amount[:\s]+\$?\s*([0-9,]+\.[0-9]{2})/i,
    /amount\s*(?:paid|charged|due)[:\s]+\$?\s*([0-9,]+\.[0-9]{2})/i,
    /total[:\s]+\$?\s*([0-9,]+\.[0-9]{2})/i,
    /you\s*paid[:\s]+\$?\s*([0-9,]+\.[0-9]{2})/i,
    /charged[:\s]+\$?\s*([0-9,]+\.[0-9]{2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return { total: parseFloat(m[1].replace(/,/g, "")), currency: "USD" };
  }
  const m3 = subject.match(/\$([0-9,]+\.[0-9]{2})/);
  if (m3) return { total: parseFloat(m3[1].replace(/,/g, "")), currency: "USD" };
  return { total: null, currency: "USD" };
}

function extractDate(text: string, subject: string): string | null {
  const corpus = `${subject}\n${text}`;
  const isoMatch = corpus.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const m1 = corpus.match(new RegExp(`\\b(${monthNames.join("|")})[a-z]*\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i"));
  if (m1) {
    const monthIndex = monthNames.indexOf(m1[1].toLowerCase().slice(0, 3));
    if (monthIndex >= 0) {
      return `${m1[3]}-${String(monthIndex + 1).padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
    }
  }
  const m2 = corpus.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames.join("|")})[a-z]*\\s+(\\d{4})\\b`, "i"));
  if (m2) {
    const monthIndex = monthNames.indexOf(m2[2].toLowerCase().slice(0, 3));
    if (monthIndex >= 0) {
      return `${m2[3]}-${String(monthIndex + 1).padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function autoCategorize(vendor: string): { category: string; code: string } | null {
  const lower = vendor.toLowerCase();
  for (const key of Object.keys(VENDOR_CATEGORY)) {
    if (lower.includes(key)) return VENDOR_CATEGORY[key];
  }
  return null;
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
