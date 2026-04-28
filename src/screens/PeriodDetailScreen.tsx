// Period detail — the invoice rendered as paper.
//
// Reads the in-memory current-period preview (assembled live from receipts)
// for the unsent case, OR the persisted Report + ReportLines for already-
// saved/sent periods. Lets the user:
//   - tap a row to edit the underlying receipt's notes (mutates the receipt)
//   - tap Send → goes to send sheet, which generates the PDF and emails it
//   - tap Preview PDF → generates the PDF and opens it
//
// Invoice typography aims at the Kalyani template fidelity: nominal letterhead,
// Bill-To / Invoice grid, line-item table, total row above a black hairline,
// payment-instructions footer.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import {
  fetchReportLines, periodLabel, periodStartFor, periodEndFor,
  receiptsForPeriod, totalCentsOf, fmtCents, assembleReport, saveReport,
} from '../lib/reports';
import { Receipt, Report, ReportLine } from '../types';
import { colors, type, reportStatusMeta } from '../theme';

const KAI_RECIPIENT = 'thurston.adams@kalyaniaftermarket.com';

// Parse 'KAI-2026-05' → period_start '2026-05-01'.
function parseReportId(reportId: string): string | null {
  const m = reportId.match(/^KAI-(\d{4})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function PeriodDetailScreen() {
  const { state, navigate, updateReceipt, userId } = useStore();
  const insets = useSafeAreaInsets();
  const reportId = state.currentReportId ?? '';

  const [persistedReport, setPersistedReport] = useState<Report | null>(null);
  const [persistedLines, setPersistedLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Period bounds derived from the report id (e.g. KAI-2026-05 → May 2026).
  const periodStart = parseReportId(reportId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Best-effort fetch of any persisted report + lines for this id.
        // It's fine if there isn't one — we'll fall back to the live preview.
        const [rep, lines] = await Promise.all([
          (async () => {
            try {
              const all = await import('../lib/reports').then(m => m.fetchReports());
              return all.find(r => r.id === reportId) ?? null;
            } catch { return null; }
          })(),
          (async () => {
            try { return await fetchReportLines(reportId); } catch { return []; }
          })(),
        ]);
        if (cancelled) return;
        setPersistedReport(rep);
        setPersistedLines(lines);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  // Live preview from local receipts. Used when no persisted lines exist
  // (current month, drafting). The persisted lines win once the report has
  // been saved, because they snapshot what was actually billed.
  const liveReceipts: Receipt[] = useMemo(() => {
    if (!periodStart) return [];
    const periodEnd = periodEndFor(periodStart);
    return receiptsForPeriod(state.receipts, 'kai', periodStart, periodEnd);
  }, [state.receipts, periodStart]);

  const liveTotalCents = useMemo(() => totalCentsOf(liveReceipts), [liveReceipts]);

  const lines: ReportLine[] = persistedLines.length > 0
    ? persistedLines
    : liveReceipts.map((r, i) => ({
        reportId,
        receiptId: r.id,
        lineNo: i + 1,
        date: r.date,
        vendor: r.vendor,
        category: r.category,
        notes: r.notes,
        totalCents: Math.round(r.total * 100),
      }));

  const totalCents = persistedReport ? persistedReport.totalCents : liveTotalCents;
  const lineCount = lines.length;
  const status = persistedReport?.status ?? (lineCount > 0 ? 'ready' : 'draft');
  const meta = reportStatusMeta[status];

  // Inline-edit state for notes. Tap a row → set editingId; tap save closes it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');

  const startEditNotes = (line: ReportLine) => {
    if (status === 'sent' || status === 'paid') {
      Alert.alert('Sent', 'This invoice has been sent. Edit the underlying receipt to fix typos for next month.');
      return;
    }
    setEditingId(line.receiptId);
    setEditNote(line.notes);
  };

  const saveEditNotes = () => {
    if (!editingId) return;
    const r = state.receipts.find(x => x.id === editingId);
    if (r) {
      updateReceipt({ ...r, notes: editNote });
    }
    setEditingId(null);
  };

  // Persist the assembled report to Supabase. Doesn't change status to sent
  // — only saveReport drafts it. Sent flag is set by the Send sheet.
  const handlePersistDraft = useCallback(async () => {
    if (!periodStart) return;
    setSaving(true);
    try {
      const { report, lines: assembledLines } = assembleReport(state.receipts, 'kai', periodStart);
      report.recipientEmail = persistedReport?.recipientEmail ?? KAI_RECIPIENT;
      if (persistedReport?.status) report.status = persistedReport.status;
      await saveReport(report, assembledLines, userId);
      setPersistedReport(report);
      setPersistedLines(assembledLines);
    } catch (err) {
      Alert.alert('Save failed', String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }, [periodStart, state.receipts, persistedReport, userId]);

  const handleSend = async () => {
    // Persist first so the Send sheet has the latest snapshot to PDF + email.
    await handlePersistDraft();
    navigate('send-sheet');
  };

  if (!reportId || !periodStart) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No report selected.</Text>
          <Pressable onPress={() => navigate('reports')}>
            <Text style={styles.backLink}>Back to Reports</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('reports')}>
          <Icon name="chevronLeft" size={20} color={colors.modern.brand} />
          <Text style={styles.navBack}>Reports</Text>
        </Pressable>
        <Text style={styles.navTitle}>{periodLabel(periodStart)}</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.modern.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Letterhead */}
          <View style={styles.letterhead}>
            <Text style={styles.brand}>Kalyani Aftermarket</Text>
            <Text style={styles.brandSub}>166 E 96th St Suite 3B · New York, NY 10128</Text>
          </View>

          {/* Bill To / Invoice grid */}
          <View style={styles.headerGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Bill to</Text>
              <Text style={styles.billTo}>KAI</Text>
              <Text style={styles.addrLine}>508 Carthage St</Text>
              <Text style={styles.addrLine}>Sanford, NC 27330</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.eyebrow}>Invoice</Text>
              <Text style={styles.invoiceNum}>{reportId}</Text>
              <Text style={styles.addrLine}>
                {persistedReport?.invoiceDate ? `Issued ${persistedReport.invoiceDate}` : 'Draft — not yet issued'}
              </Text>
              {persistedReport?.dueDate ? (
                <Text style={styles.addrLine}>Due {persistedReport.dueDate}</Text>
              ) : null}
              <View style={[styles.pill, { backgroundColor: meta.bg, marginTop: 6 }]}>
                <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
              </View>
            </View>
          </View>

          {/* Lines */}
          <View style={styles.lineHeader}>
            <Text style={[styles.eyebrowSmall, { width: 44 }]}>Date</Text>
            <Text style={[styles.eyebrowSmall, { flex: 1 }]}>Vendor · category</Text>
            <Text style={[styles.eyebrowSmall, { width: 70, textAlign: 'right' }]}>Amount</Text>
          </View>

          {lines.length === 0 && (
            <View style={styles.emptyLines}>
              <Text style={styles.emptyText}>No KAI receipts in this period yet.</Text>
              <Text style={styles.emptyHint}>Tag receipts as "Bill to KAI" to fill this invoice.</Text>
            </View>
          )}

          {lines.map(line => {
            const editing = editingId === line.receiptId;
            return (
              <Pressable
                key={line.receiptId}
                onPress={() => startEditNotes(line)}
                style={({ pressed }) => [
                  styles.lineRow,
                  pressed && styles.lineRowPressed,
                  editing && styles.lineRowEditing,
                ]}
              >
                <Text style={[styles.lineDate, { width: 44 }]}>{line.date.slice(5).replace('-', '/')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineVendor}>{line.vendor || 'Unknown vendor'}</Text>
                  <Text style={styles.lineCategory}>
                    {line.notes ? line.notes : line.category || 'Uncategorized'}
                  </Text>
                </View>
                <Text style={[styles.lineAmount, { width: 70 }]}>
                  {(line.totalCents / 100).toFixed(2)}
                </Text>
              </Pressable>
            );
          })}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{fmtCents(totalCents)}</Text>
          </View>

          {/* Payment instructions footer */}
          <View style={styles.footer}>
            <Text style={styles.footerEyebrow}>Make payment to</Text>
            <Text style={styles.footerLine}>XMOTION VEHICLE TECHNOLOGIES LLC</Text>
            <Text style={styles.footerLine}>6855 E. Camelback Rd. Unit 5012</Text>
            <Text style={styles.footerLine}>Scottsdale, AZ 85251</Text>
            <Text style={[styles.footerEyebrow, { marginTop: 12 }]}>Bank</Text>
            <Text style={styles.footerLine}>Bank of America · Acct 4570 5190 6421</Text>
            <Text style={styles.footerLine}>ACH routing 122101706</Text>
          </View>

        </ScrollView>
      )}

      {/* Inline note-edit panel */}
      {editingId && (
        <View style={styles.editPanel}>
          <Text style={styles.editLabel}>Note</Text>
          <Text
            style={styles.editText}
            onPress={() => Alert.prompt(
              'Edit notes',
              'These notes appear on the invoice line.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => setEditingId(null) },
                {
                  text: 'Save',
                  onPress: (next?: string) => {
                    setEditNote(next ?? '');
                    setTimeout(() => saveEditNotes(), 0);
                  },
                },
              ],
              'plain-text',
              editNote,
            )}
          >
            {editNote || 'Tap to edit…'}
          </Text>
        </View>
      )}

      {/* Sticky action bar */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={handleSend}
          disabled={saving || lineCount === 0}
        >
          <Text style={styles.btnPrimaryText}>
            {saving ? 'Saving…' : status === 'sent' ? 'Re-send to KAI' : 'Send to KAI'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.55 }]}
          onPress={handlePersistDraft}
          disabled={saving}
        >
          <Text style={styles.btnSecondaryText}>{saving ? 'Saving…' : 'Save draft'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.modern.surface },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: colors.modern.border,
    backgroundColor: colors.modern.surface,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  navBack: { fontSize: 17, color: colors.modern.brand },
  navTitle: { fontSize: 17, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },
  scroll: { padding: 20, paddingBottom: 100 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  letterhead: { paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.modern.border },
  brand: { fontSize: 17, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },
  brandSub: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 2 },

  headerGrid: { flexDirection: 'row', gap: 14, marginTop: 14 },
  eyebrow: { ...type.eyebrow, fontSize: 9 },
  eyebrowSmall: { ...type.eyebrow, fontSize: 9 },
  billTo: { fontSize: 13, fontWeight: '500', color: colors.modern.ink, marginTop: 3 },
  invoiceNum: { fontSize: 13, fontWeight: '500', color: colors.modern.ink, marginTop: 3, fontVariant: ['tabular-nums'] },
  addrLine: { fontSize: 11, color: colors.modern.inkTertiary, lineHeight: 15 },

  lineHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 18, paddingBottom: 6,
    borderTopWidth: 0.5, borderTopColor: colors.modern.borderStrong,
    marginTop: 18,
    gap: 10,
  },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 10,
    borderTopWidth: 0.5, borderTopColor: colors.modern.border,
  },
  lineRowPressed: { opacity: 0.6 },
  lineRowEditing: { backgroundColor: colors.modern.surfaceHover },
  lineDate: { fontSize: 11, color: colors.modern.inkTertiary, fontVariant: ['tabular-nums'] },
  lineVendor: { fontSize: 13, color: colors.modern.ink, fontWeight: '500' },
  lineCategory: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 1 },
  lineAmount: {
    fontSize: 13, color: colors.modern.ink, fontWeight: '500',
    textAlign: 'right', fontVariant: ['tabular-nums'],
  },

  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 14, marginTop: 6,
    borderTopWidth: 1, borderTopColor: colors.modern.rule,
  },
  totalLabel: { fontSize: 14, color: colors.modern.ink, fontWeight: '500' },
  totalAmount: {
    fontSize: 17, color: colors.modern.ink, fontWeight: '500',
    letterSpacing: -0.3, fontVariant: ['tabular-nums'],
  },

  footer: { marginTop: 32, paddingTop: 18, borderTopWidth: 0.5, borderTopColor: colors.modern.border },
  footerEyebrow: { ...type.eyebrow, fontSize: 9 },
  footerLine: { fontSize: 11, color: colors.modern.inkSecondary, lineHeight: 16, marginTop: 2 },

  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  pillText: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },

  emptyLines: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.modern.inkSecondary },
  emptyHint: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 4 },

  actionBar: {
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: colors.modern.surface,
    borderTopWidth: 0.5, borderTopColor: colors.modern.border,
    gap: 6,
  },
  btnPrimary: {
    backgroundColor: colors.modern.ink,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  btnPrimaryText: { color: colors.modern.surface, fontSize: 15, fontWeight: '500', letterSpacing: -0.1 },
  btnSecondary: {
    backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.borderStrong,
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  btnSecondaryText: { color: colors.modern.ink, fontSize: 13, fontWeight: '500' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  backLink: { color: colors.modern.brand, fontSize: 14 },

  editPanel: {
    position: 'absolute', bottom: 110, left: 16, right: 16,
    backgroundColor: colors.modern.surfaceHover,
    borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: colors.modern.border,
  },
  editLabel: { ...type.eyebrow, fontSize: 9 },
  editText: { fontSize: 13, color: colors.modern.ink, marginTop: 4 },
});
