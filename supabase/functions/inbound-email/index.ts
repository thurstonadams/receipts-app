// supabase/functions/inbound-email/index.ts
//
// Webhook receiver for Postmark Inbound. Wires emails sent to
//   receipts@xfix.tech              -> xFix entity
//   receipts@xmotionaxles.com       -> KAI entity
//   receipts+personal@xfix.tech     -> Personal entity (sub-addressing)
// into rows in public.receipts with status='needs-review'.
//
// Pipeline:
//   1. Verify shared-secret token in the URL.
//   2. Look up the From: address in public.email_inbound_senders. Reject if
//      not present (default-on allowlist).
//   3. Parse the To: address — base address picks the entity, an optional
//      "+tag" sub-address overrides it. Reject if neither resolves.
//   4. Extract vendor from From-Name (falling back to domain), total + date
//      from regex, and if Anthropic creds are set fall back to a Haiku call
//      for anything regex missed.
//   5. Auto-categorize from a small vendor → category dictionary.
//   6. Upload any image attachment to the receipts bucket (so the existing
//      photo_path machinery in the app renders it as a thumbnail), and any
//      PDF / EML to a separate receipt-attachments bucket for "View original".
//   7. Insert the row. Realtime publication already includes public.receipts
//      so the iOS app surfaces it within ~1s without polling.
//
// Required Supabase secrets:
//   INBOUND_WEBHOOK_SECRET   - shared secret matched against ?token= on the URL
//   ANTHROPIC_API_KEY        - optional; when set, enables AI extraction fallback
//
// Already provided by the Supabase runtime (no need to set):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_WEBHOOK_SECRET = Deno.env.get("INBOUND_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// ── Routing config ─────────────────────────────────────────────────────────
const ENTITY_BY_ADDRESS: Record<string, string> = {
  "receipts@xfix.tech": "xfix",
  "receipts@xmotionaxles.com": "kai",
};

// Sub-addressing tags — receipts+<tag>@xfix.tech overrides the base entity.
const TAG_TO_ENTITY: Record<string, string> = {
  "personal": "personal",
  "kai":      "kai",
  "xfix":     "xfix",
};

// ── Auto-categorize ────────────────────────────────────────────────────────
// Vendor name (lowercased) → category + GL code. The Edge Function does a
// substring match so "Anthropic, PBC" still matches "anthropic".
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
  "amazon":        { category: "Office Supplies",          code: "6300" }, // best-guess; user can re-categorize
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
  RawEmail?: string;     // present if Postmark "Include raw email content" is on
}

// ── Entry point ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight isn't necessary for Postmark but keeps tooling happy.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
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
    // Return 200 so Postmark doesn't retry; we just drop unauthorized senders.
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

  // 4. Vendor / total / date extraction
  const vendor = extractVendor(fromName, fromEmail);
  let { total, currency } = extractTotal(textBody, subject);
  let isoDate: string | null = extractDate(textBody, subject) ?? toISODate(dateHeader);

  // 4b. Anthropic fallback for missing total
  if (total == null && ANTHROPIC_API_KEY) {
    try {
      const ai = await callAnthropic(textBody, subject, vendor);
      if (ai.total != null) total = ai.total;
      if (!isoDate && ai.date) isoDate = ai.date;
    } catch (e) {
      console.warn("inbound-email: anthropic fallback failed", e);
    }
  }

  // 5. Auto-categorize
  const cat = autoCategorize(vendor);

  // 6. Upload attachments
  const receiptId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  let photoPath: string | null = null;
  let attachmentPath: string | null = null;
  let thumbTone = Math.floor(Math.random() * 360);

  // First image attachment becomes the receipt photo (existing photo_path machinery handles the rest).
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

  // First PDF attachment goes to the receipt-attachments bucket as the audit copy.
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

  // If neither image nor PDF, save the raw email body as an HTML attachment so
  // "View original" still has something to show.
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

  // 7. Insert receipt row
  const now = Date.now();
  const { error: insertErr } = await supabase.from("receipts").insert({
    id: receiptId,
    user_id: userId,
    entity_id: route.entityId,
    vendor: vendor || "Unknown",
    date: isoDate ?? toISODate(new Date()),
    total: total ?? 0,
    currency: currency || "USD",
    payment: "",
    category: cat?.category ?? "Other",
    category_code: cat?.code ?? "6999",
    project: null,
    notes: subject,
    status: "needs-review",
    thumb_tone: thumbTone,
    photo_uri: null,
    photo_path: photoPath,
    attachment_path: attachmentPath,
    source: "email",
    source_email: fromEmail,
    source_subject: subject,
    created_at: now,
    updated_at: now,
  });

  if (insertErr) {
    console.error("inbound-email: insert failed", insertErr);
    return new Response("insert failed", { status: 500, headers: corsHeaders() });
  }

  return new Response(
    JSON.stringify({ ok: true, id: receiptId, entity: route.entityId, vendor }),
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

function parseToAddress(addr: string): { entityId: string | null; baseAddress: string } {
  const m = addr.match(/^([^+@]+)(?:\+([^@]+))?@(.+)$/);
  if (!m) return { entityId: null, baseAddress: addr };
  const local = m[1];
  const tag = (m[2] ?? "").toLowerCase();
  const domain = m[3];
  const baseAddress = `${local}@${domain}`;

  if (tag && TAG_TO_ENTITY[tag]) {
    return { entityId: TAG_TO_ENTITY[tag], baseAddress };
  }
  return { entityId: ENTITY_BY_ADDRESS[baseAddress] ?? null, baseAddress };
}

function extractVendor(fromName: string, fromEmail: string): string {
  if (fromName && !fromName.includes("@")) {
    return cleanVendorName(fromName);
  }
  // From email like "billing@anthropic.com" → "Anthropic"
  const domain = fromEmail.split("@")[1] ?? "";
  const head = domain.split(".")[0];
  if (head === "mail" || head === "email" || head === "noreply" || head === "no-reply") {
    // common subdomains, fall through to the second segment
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
  // "Total: $X.XX" / "Amount paid: $X.XX" / "Total amount $X.XX"
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
  // Look in subject as last resort: "your receipt for $25.00"
  const m3 = subject.match(/\$([0-9,]+\.[0-9]{2})/);
  if (m3) return { total: parseFloat(m3[1].replace(/,/g, "")), currency: "USD" };
  return { total: null, currency: "USD" };
}

function extractDate(text: string, subject: string): string | null {
  const corpus = `${subject}\n${text}`;
  // ISO YYYY-MM-DD
  const isoMatch = corpus.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // "April 24, 2026" / "Apr 24, 2026" / "24 Apr 2026"
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

interface AnthropicExtract { total: number | null; date: string | null }

async function callAnthropic(textBody: string, subject: string, vendor: string): Promise<AnthropicExtract> {
  const prompt = `Extract the total amount paid (in USD, as a plain number) and the receipt date from this email.
Reply in strict JSON only, no prose: {"total": <number or null>, "date": "YYYY-MM-DD" or null}.

Subject: ${subject}
Vendor: ${vendor}

Body (truncated):
${textBody.slice(0, 4000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const content: string = data.content?.[0]?.text ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { total: null, date: null };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      total: typeof parsed.total === "number" && isFinite(parsed.total) ? parsed.total : null,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    };
  } catch {
    return { total: null, date: null };
  }
}
