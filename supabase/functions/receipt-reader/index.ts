// receipt-reader — re-reads receipts that are stuck in "needs review" using
// the shared AI reader (../_shared/reader.ts). Built 2026-09-24 to clear the
// backlog of forwarded emails filed as vendor "Thurston Adams" / $0.00.
//
// Two locks: platform JWT (anon key) + header x-reader-key whose SHA-256 must
// match READER_KEY_SHA256. Only touches rows that are still exactly as the
// email import left them (updated_at = created_at, status needs-review), so
// nothing Thurston edited by hand is ever overwritten. Every change is
// written to receipt_ai_audit with the before/after values.
//
//   GET  ?action=health                       → key present + model reachable
//   POST {"action":"dryrun","ids":[...]}       → what it WOULD write
//   POST {"action":"apply","ids":[...]}        → write + audit
//   POST {"action":"peek","ids":[...]}         → read-only, any row
//   POST {"action":"vendoronly","ids":[...]}   → fix vendor only on forwarder-named rows
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { extractWithClaude, decide, isForwarderName, type Attachment, type ReaderInput } from "./reader.ts";

const READER_KEY_SHA256 = "aebcc69eda96d5ba5c5a9f4aac4f62b6cec64963944007974c080bf16290cca1";
const DEFAULT_MODEL = Deno.env.get("READER_MODEL") ?? "claude-haiku-4-5-20251001";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { "content-type": "application/json" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const key = req.headers.get("x-reader-key") ?? "";
  if (!key || (await sha256(key)) !== READER_KEY_SHA256) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (req.method === "GET") {
    const model = new URL(req.url).searchParams.get("model") ?? DEFAULT_MODEL;
    // Deployed-source fingerprint, compared against the repo copy.
    const src: Record<string, string> = {};
    for (const f of ["index.ts", "reader.ts"]) {
      try { src[f] = (await sha256(await Deno.readTextFile(new URL(`./${f}`, import.meta.url)))).slice(0, 16); }
      catch (e) { src[f] = `unreadable: ${(e as Error).message}`.slice(0, 80); }
    }
    if (!apiKey) return json({ hasKey: false, model, src });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }),
    });
    return json({ hasKey: true, model, src, anthropicStatus: r.status, body: (await r.text()).slice(0, 200) });
  }

  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? "dryrun";
  const model: string = body.model ?? DEFAULT_MODEL;
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);
  if (ids.length === 0 || ids.length > 8) return json({ error: "pass 1-8 ids" }, 400);

  const { data: rows, error } = await sb.from("receipts")
    .select("id,user_id,vendor,date,total,currency,category,category_code,status,source,source_email,source_subject,attachment_path,photo_path,created_at,updated_at")
    .in("id", ids);
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const r of rows ?? []) {
    const untouched = r.status === "needs-review" && r.source === "email" && r.updated_at === r.created_at;
    // "peek" reads any row and never writes (used to review hand-edited rows).
    // "vendoronly" fixes ONLY the vendor on rows still filed as the forwarder
    // (e.g. hand-reviewed rows): amounts, dates and currency are left as-is.
    const forwarderRow = isForwarderName(r.vendor);
    if (action === "vendoronly" && !forwarderRow) { results.push({ id: r.id, skipped: "vendor is not the forwarder" }); continue; }
    if (!untouched && action !== "peek" && action !== "vendoronly") { results.push({ id: r.id, skipped: "edited by user or not an email needs-review row" }); continue; }
    try {
      const input: ReaderInput = {
        subject: r.source_subject ?? "",
        fromEmail: r.source_email ?? undefined,
        receivedAt: new Date(Number(r.created_at)).toISOString(),
        attachments: [],
      };
      const atts: Attachment[] = [];
      if (r.attachment_path) {
        const { data: blob } = await sb.storage.from("receipt-attachments").download(r.attachment_path);
        if (blob) {
          if (r.attachment_path.endsWith(".html")) input.htmlBody = await blob.text();
          else if (r.attachment_path.endsWith(".pdf")) {
            atts.push({ name: "original.pdf", contentType: "application/pdf", base64: encodeBase64(new Uint8Array(await blob.arrayBuffer())) });
          }
        }
      }
      if (r.photo_path) {
        const { data: blob } = await sb.storage.from("receipts").download(r.photo_path);
        if (blob) {
          const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
          atts.push({ name: "photo", contentType: type, base64: encodeBase64(new Uint8Array(await blob.arrayBuffer())) });
        }
      }
      input.attachments = atts;

      const { extraction, raw, forwardedFrom, evidence } = await extractWithClaude(input, { apiKey, model, fetchImpl: fetch as any });
      const d = decide(extraction, { vendor: r.vendor, date: r.date, category: r.category }, evidence);
      const after = {
        vendor: d.vendor, date: d.date, total: d.total, currency: d.currency, category: d.category,
        category_code: d.categoryCode, status: d.status, review_reason: d.reviewReason, ai_extracted: true,
      };
      const before = { vendor: r.vendor, date: r.date, total: r.total, currency: r.currency, category: r.category, category_code: r.category_code, status: r.status };

      if (action === "vendoronly") {
        let vendor = d.vendor;
        if (vendor.length > 30 && vendor.includes(" - ")) vendor = vendor.split(" - ")[0].trim();
        if (!vendor || vendor === "Unknown" || isForwarderName(vendor)) { results.push({ id: r.id, skipped: "AI found no vendor", extraction }); continue; }
        const { error: auErr } = await sb.from("receipt_ai_audit").insert({
          receipt_id: r.id, user_id: r.user_id, before: { vendor: r.vendor }, after: { vendor },
          model: `${model} (vendor-only)`, raw_reply: raw.slice(0, 4000), mode: "backfill",
        });
        if (auErr) throw new Error(`audit: ${auErr.message}`);
        const { error: upErr, count } = await sb.from("receipts")
          .update({ vendor, updated_at: Date.now() }, { count: "exact" })
          .eq("id", r.id).eq("updated_at", r.updated_at);
        if (upErr) throw new Error(`update: ${upErr.message}`);
        results.push({ id: r.id, applied: count === 1, before: { vendor: r.vendor }, after: { vendor }, aiAlsoRead: after });
      } else if (action === "apply") {
        const now = Date.now();
        const { error: auErr } = await sb.from("receipt_ai_audit").insert({
          receipt_id: r.id, user_id: r.user_id, before, after, model, raw_reply: raw.slice(0, 4000), mode: "backfill",
        });
        if (auErr) throw new Error(`audit: ${auErr.message}`);
        // Guard again at write time: only if still untouched.
        const { error: upErr, count } = await sb.from("receipts")
          .update({ ...after, updated_at: now }, { count: "exact" })
          .eq("id", r.id).eq("updated_at", r.updated_at);
        if (upErr) throw new Error(`update: ${upErr.message}`);
        results.push({ id: r.id, applied: count === 1, before, after, forwardedFrom, evidence });
      } else {
        results.push({ id: r.id, before, after, forwardedFrom, extraction, evidence });
      }
    } catch (e) {
      results.push({ id: r.id, error: String((e as Error).message ?? e) });
    }
  }
  return json({ action, model, results });
});
