// KAI month — the capture-side worksheet for one period.
//
// The invoice itself is NOT built here any more. Since 2026-09-24 the house
// invoice (invoice # = MMDDYY, ECB conversion, fee line) is built at
// month-end by the `kai-monthly-invoice` skill from kai_export.receipts_kai.
// This screen lets Thurston:
//   - see every KAI-tagged line for the month in its ORIGINAL currency,
//     with per-currency subtotals (never summed across currencies)
//   - tap a row to edit the business-purpose note (the skill uses notes)
//   - record "billed on invoice #MMDDYY" once the month-end invoice is out,
//     which writes report_receipts so the skill can spot carry-overs.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import {
  fetchReports, fetchReportLines, periodLabel, periodEndFor,
  receiptsForPeriod, assembleReport, saveReport, markReportBilled,
  invoiceDateFromNumber,
} from '../lib/reports';
import { subtotalsByCurrency } from '../lib/kaiBilling';
import { Receipt, Report, ReportLine } from '../types';
import { colors, type, reportStatusMeta } from '../theme';

// Parse 'KAI-2026-05' → period_start '2026-05-01'.
function parseReportId(reportId: string): string | null {
  const m = reportId.match(/^KAI-(\d{4})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

function todayMMDDYY(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}${String(d.getFullYear()).slice(2)}`;
}

function fmtAmount(cents: number, currency: string): string {
  const n = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'USD' ? n : `${currency} ${n}`;
}

export function PeriodDetailScreen() {
  const { state, receipts, navigate, updateReceipt, userId } = useStore();
  const insets = useSafeAreaInsets();
  const reportId = state.currentReportId ?? '';

  const [persistedReport, setPersistedReport] = useState<Report | null>(null);
  const [persistedLines, setPersistedLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const periodStart = parseReportId(reportId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A failed fetch must NOT look like "not billed yet" — that would
        // offer "Mark billed" on a month that is already billed or paid.
        const [rep, lines] = await Promise.all([
          fetchReports().then(all => all.find(r => r.id === reportId) ?? null),
          fetchReportLines(reportId),
        ]);
        if (cancelled) return;
        setPersistedReport(rep);
        setPersistedLines(lines);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  const billed = persistedReport?.status === 'sent' || persistedReport?.status === 'paid';

  // Live lines from local receipts until the period is billed; after that the
  // persisted snapshot is what was actually billed.
  const liveReceipts: Receipt[] = useMemo(() => {
    if (!periodStart) return [];
    return receiptsForPeriod(receipts, 'kai', periodStart, periodEndFor(periodStart));
  }, [receipts, periodStart]);

  // Saved lines carry no currency column; look it up from the receipt. If the
  // receipt is gone, say so rather than defaulting to USD (which would fold a
  // EUR line into the USD subtotal).
  const currencyOf = useCallback(
    (receiptId: string) => {
      const r = receipts.find(x => x.id === receiptId);
      return r ? (r.currency || 'USD').toUpperCase() : '???';
    },
    [receipts],
  );

  const lines: (ReportLine & { currency: string })[] = billed && persistedLines.length > 0
    ? persistedLines.map(l => ({ ...l, currency: currencyOf(l.receiptId) }))
    : liveReceipts.map((r, i) => ({
        reportId,
        receiptId: r.id,
        lineNo: i + 1,
        date: r.date,
        vendor: r.vendor,
        category: r.category,
        notes: r.notes,
        totalCents: Math.round(r.total * 100),
        currency: (r.currency || 'USD').toUpperCase(),
      }));

  const subtotals = useMemo(
    () => subtotalsByCurrency(lines.map(l => ({ total: l.totalCents / 100, currency: l.currency }))),
    [lines],
  );
  const currencies = Object.keys(subtotals).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
  const hasForeign = currencies.some(c => c !== 'USD');

  const status: Report['status'] = billed ? persistedReport!.status : (lines.length > 0 ? 'ready' : 'draft');
  const meta = reportStatusMeta[status];

  // Inline-edit state for notes (business purpose).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');

  const startEditNotes = (line: ReportLine) => {
    if (billed) {
      Alert.alert('Already billed', 'This month is on a sent invoice. Edit the receipt itself if something needs correcting.');
      return;
    }
    setEditingId(line.receiptId);
    setEditNote(line.notes);
  };

  // Takes the value directly: the old setTimeout(saveEditNotes) pattern read
  // a stale editNote from the previous render and saved the old text.
  const saveEditNotes = (receiptId: string, next: string) => {
    const r = receipts.find(x => x.id === receiptId);
    if (r) updateReceipt({ ...r, notes: next });
    setEditNote(next);
    setEditingId(null);
  };

  const recordBilled = useCallback(async (invoiceNumber: string) => {
    if (!periodStart) return;
    setSaving(true);
    try {
      // Re-check the server right before writing: never overwrite a period
      // that another device (or an earlier tap) already billed or paid.
      const current = (await fetchReports()).find(r => r.id === reportId);
      if (current && (current.status === 'sent' || current.status === 'paid')) {
        setPersistedReport(current);
        Alert.alert('Already billed', `This month is already on invoice #${current.invoiceNumber}.`);
        return;
      }
      const { report, lines: assembled } = assembleReport(receipts, 'kai', periodStart);
      report.invoiceNumber = invoiceNumber;
      await saveReport(report, assembled, userId);
      await markReportBilled(report.id, invoiceNumber);
      setPersistedReport({
        ...report,
        status: 'sent',
        invoiceDate: invoiceDateFromNumber(invoiceNumber) ?? undefined,
        sentAt: Date.now(),
      });
      setPersistedLines(assembled);
    } catch (err) {
      Alert.alert('Could not record', String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }, [periodStart, reportId, receipts, userId]);

  const promptBilled = () => {
    Alert.prompt(
      'Billed on which invoice?',
      'Enter the month-end invoice number (MMDDYY, e.g. 092426). This marks these lines as billed so they are not carried over.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: (text?: string) => {
            const num = (text ?? '').trim();
            if (!invoiceDateFromNumber(num)) {
              Alert.alert('Invalid invoice number', 'Use the MMDDYY invoice date, e.g. 092426.');
              return;
            }
            recordBilled(num);
          },
        },
      ],
      'plain-text',
      todayMMDDYY(),
      'number-pad',
    );
  };

  if (!reportId || !periodStart) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No period selected.</Text>
          <Pressable onPress={() => navigate('reports')}>
            <Text style={styles.backLink}>Back to KAI</Text>
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
          <Text style={styles.navBack}>KAI</Text>
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

          <View style={styles.letterhead}>
            <Text style={type.eyebrow}>KAI · month-end</Text>
            <Text style={styles.brand}>{periodLabel(periodStart)} reimbursables</Text>
            <View style={[styles.pill, { backgroundColor: meta.bg, marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
            </View>
            <Text style={styles.billedLine}>
              {billed
                ? `Billed on invoice #${persistedReport!.invoiceNumber}${persistedReport!.invoiceDate ? ` · ${persistedReport!.invoiceDate}` : ''}`
                : 'The invoice is built at month-end from these lines.'}
            </Text>
          </View>

          <View style={styles.lineHeader}>
            <Text style={[styles.eyebrowSmall, { width: 44 }]}>Date</Text>
            <Text style={[styles.eyebrowSmall, { flex: 1 }]}>Vendor · purpose</Text>
            <Text style={[styles.eyebrowSmall, { width: 96, textAlign: 'right' }]}>Amount</Text>
          </View>

          {lines.length === 0 && (
            <View style={styles.emptyLines}>
              <Text style={styles.emptyText}>No KAI receipts in this month yet.</Text>
              <Text style={styles.emptyHint}>Turn on "Bill to KAI" on a receipt to add it here.</Text>
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
                    {line.notes ? line.notes : `${line.category || 'Uncategorized'} · add a business purpose`}
                  </Text>
                </View>
                <Text style={[styles.lineAmount, { width: 96 }]}>
                  {fmtAmount(line.totalCents, line.currency)}
                </Text>
              </Pressable>
            );
          })}

          {lines.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotals</Text>
            </View>
          )}
          {currencies.map(c => (
            <View key={c} style={styles.subRow}>
              <Text style={styles.subLabel}>{c}</Text>
              <Text style={styles.subAmount}>{fmtAmount(subtotals[c], c)}</Text>
            </View>
          ))}
          {hasForeign && (
            <Text style={styles.fxNote}>
              Currencies are never added together here. Non-USD lines are converted at the ECB
              reference rate for the charge date when the month-end invoice is built.
            </Text>
          )}

        </ScrollView>
      )}

      {editingId && (
        <View style={styles.editPanel}>
          <Text style={styles.editLabel}>Business purpose</Text>
          <Text
            style={styles.editText}
            onPress={() => Alert.prompt(
              'Business purpose',
              'Appears in the Notes column of the month-end invoice.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => setEditingId(null) },
                {
                  text: 'Save',
                  onPress: (next?: string) => saveEditNotes(editingId, next ?? ''),
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

      {loadFailed && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.emptyHint}>
            Couldn't load this month's billing status. Check your connection and reopen.
          </Text>
        </View>
      )}

      {!loading && !loadFailed && !billed && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.btnPrimary, (saving || lines.length === 0) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            onPress={promptBilled}
            disabled={saving || lines.length === 0}
          >
            <Text style={styles.btnPrimaryText}>{saving ? 'Recording…' : 'Mark billed on invoice #…'}</Text>
          </Pressable>
        </View>
      )}
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

  subRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6,
  },
  subLabel: { fontSize: 12, color: colors.modern.inkSecondary },
  subAmount: { fontSize: 13, color: colors.modern.ink, fontWeight: '500', fontVariant: ['tabular-nums'] },
  fxNote: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 10, lineHeight: 15 },
  billedLine: { fontSize: 12, color: colors.modern.inkSecondary, marginTop: 6 },
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
