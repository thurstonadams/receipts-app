// PDF generation + send wrapper for invoices.
//
// `expo-print` renders the HTML template to a local PDF file; we copy it to
// a stable filename (so the email attachment shows "KAI-2026-05.pdf" instead
// of expo-print's random temp name); then either upload it to the `reports`
// Storage bucket and / or hand off to the system mail composer.
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import { Report, ReportLine } from '../types';
import { buildInvoiceHtml } from './pdfTemplate';
import { supabase } from './supabase';
import { fmtCents } from './reports';

/**
 * Render a Report + lines to a PDF on disk. Returns the local file URI.
 * The file is stored at <cacheDir>/reports/<reportId>.pdf — stable name so
 * the email attachment label is meaningful, and overwriteable across sends.
 */
export async function renderInvoicePdf(report: Report, lines: ReportLine[]): Promise<string> {
  const html = buildInvoiceHtml(report, lines);
  // expo-print picks its own filename. We then move/copy to a stable path.
  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

  const dir = `${FileSystem.cacheDirectory}reports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const finalUri = `${dir}${report.id}.pdf`;
  // Overwrite if it exists.
  await FileSystem.deleteAsync(finalUri, { idempotent: true });
  await FileSystem.moveAsync({ from: tmpUri, to: finalUri });
  return finalUri;
}

/**
 * Upload the rendered PDF to the `reports` Storage bucket. Returns the
 * object key (`<userId>/<reportId>.pdf`) the row should be patched with.
 */
export async function uploadInvoicePdf(
  pdfUri: string,
  userId: string,
  reportId: string,
): Promise<string> {
  const key = `${userId}/${reportId}.pdf`;
  // Read the file as base64 then convert to bytes — Supabase JS client
  // accepts ArrayBuffer / Blob / Uint8Array uploads.
  const b64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: FileSystem.EncodingType.Base64 });
  // Buffer isn't always available in RN; decode base64 manually.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const { error } = await supabase
    .storage
    .from('reports')
    .upload(key, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (error) throw error;
  return key;
}

/**
 * Open the system mail composer with the PDF pre-attached and the email
 * pre-composed. iOS Mail handles delivery; we never hold credentials.
 *
 * Returns the composer result so the caller can decide what status to set
 * ('sent' if status === 'sent', leave as draft if 'cancelled' / 'saved').
 */
export async function composeInvoiceEmail(args: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachmentUri: string;
}): Promise<MailComposer.MailComposerResult> {
  const available = await MailComposer.isAvailableAsync();
  if (!available) {
    throw new Error('Mail composer not available on this device.');
  }
  return MailComposer.composeAsync({
    recipients: [args.to],
    ccRecipients: args.cc ? [args.cc] : undefined,
    subject: args.subject,
    body: args.body,
    attachments: [args.attachmentUri],
    isHtml: false,
  });
}

/**
 * Compose the default subject + body for a KAI invoice.
 */
export function buildEmailDefaults(report: Report, lineCount: number): { subject: string; body: string } {
  const subject = `KAI invoice — ${report.id} — ${fmtCents(report.totalCents)}`;
  const periodLabel = (() => {
    const d = new Date(report.periodStart + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();
  const body =
    `Hi,\n\n` +
    `Attached is the KAI invoice for ${periodLabel} — ${lineCount} line ${lineCount === 1 ? 'item' : 'items'}, all pass-through, ${fmtCents(report.totalCents)} total. Due in 30 days.\n\n` +
    `— Thurston`;
  return { subject, body };
}
