// Reports list screen — KAI passthrough invoices.
//
// Modern white dashboard:
//   - Stat row: This period · Awaiting payment · Paid YTD · Overdue
//   - "Periods" section: cards for each month, newest first.
//
// The current period (in-progress month) is computed locally from receipts
// tagged `billableTo === 'kai'` whose date sits in the current month. It
// shows alongside the sent/paid reports from the cloud as a "Ready" card.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import {
  fetchReports, periodStartFor, periodEndFor, periodLabel, reportIdFor,
  receiptsForPeriod, totalCentsOf, computeStats, fmtCents,
} from '../lib/reports';
import { Report } from '../types';
import { colors, type, reportStatusMeta } from '../theme';

export function ReportsScreen() {
  const { state, navigate, openReport } = useStore();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await fetchReports();
      setReports(list);
    } catch {
      // Network hiccup: leave existing data visible.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Current-period preview: receipts tagged for KAI in the current month.
  const currentPeriodStart = useMemo(() => periodStartFor(today), [today]);
  const currentPeriodEnd = useMemo(() => periodEndFor(today), [today]);
  const currentPeriodReceipts = useMemo(
    () => receiptsForPeriod(state.receipts, 'kai', currentPeriodStart, currentPeriodEnd),
    [state.receipts, currentPeriodStart, currentPeriodEnd],
  );
  const currentPeriodCents = useMemo(
    () => totalCentsOf(currentPeriodReceipts),
    [currentPeriodReceipts],
  );

  // The current period as a virtual "Report" card. If a saved/sent report
  // already exists for this month, prefer that record (its status is real).
  const currentPeriodId = reportIdFor('kai', currentPeriodStart);
  const persistedCurrent = reports.find(r => r.id === currentPeriodId);
  const currentCard: Report = persistedCurrent ?? {
    id: currentPeriodId,
    client: 'kai',
    periodStart: currentPeriodStart,
    periodEnd: currentPeriodEnd,
    status: currentPeriodReceipts.length > 0 ? 'ready' : 'draft',
    invoiceNumber: currentPeriodId,
    totalCents: currentPeriodCents,
    lineCount: currentPeriodReceipts.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Older periods: everything else from the saved list.
  const olderReports = reports.filter(r => r.id !== currentPeriodId);

  const stats = useMemo(
    () => computeStats(reports, currentPeriodCents, today),
    [reports, currentPeriodCents, today],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.modern.brand} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Reports</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.modern.brand} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Reports</Text>
          <Text style={styles.title}>KAI invoices</Text>
          <Text style={styles.subtitle}>Kalyani → KAI · pass-through</Text>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <Stat label="This period" value={fmtCents(stats.thisPeriod)} tint="ink" />
          <Stat label="Awaiting payment" value={fmtCents(stats.awaiting)} tint="amber" />
        </View>
        <View style={styles.statRow}>
          <Stat label="Paid YTD" value={fmtCents(stats.paidYtd)} tint="green" />
          <Stat label="Overdue" value={fmtCents(stats.overdue)} tint={stats.overdue > 0 ? 'red' : 'ink'} />
        </View>

        {/* Organize sweep entry — surfaces only when there are unfiled receipts */}
        {state.receipts.some(r => r.billableTo === undefined) && (
          <Pressable
            onPress={() => navigate('organize')}
            style={({ pressed }) => [styles.organizeBtn, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.organizeTitle}>Organize unfiled receipts</Text>
              <Text style={styles.organizeSub}>
                {state.receipts.filter(r => r.billableTo === undefined).length} need a billing decision
              </Text>
            </View>
            <Icon name="chevron" size={14} color={colors.modern.inkTertiary} />
          </Pressable>
        )}

        <Text style={[styles.eyebrow, { marginTop: 18, marginLeft: 4 }]}>Periods</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.modern.brand} />
          </View>
        ) : (
          <>
            <PeriodCard report={currentCard} onPress={() => openReport(currentCard.id)} highlight />
            {olderReports.map(r => (
              <PeriodCard key={r.id} report={r} onPress={() => openReport(r.id)} />
            ))}
            {!persistedCurrent && currentPeriodReceipts.length === 0 && olderReports.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No KAI receipts yet. Tag receipts as "Bill to KAI" on the Edit screen.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: 'ink' | 'amber' | 'green' | 'red' }) {
  const color =
    tint === 'amber' ? colors.modern.amber :
    tint === 'green' ? colors.modern.green :
    tint === 'red' ? colors.modern.red :
    colors.modern.ink;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function PeriodCard({ report, onPress, highlight }: { report: Report; onPress: () => void; highlight?: boolean }) {
  const meta = reportStatusMeta[report.status] ?? reportStatusMeta.draft;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlight && styles.cardHighlight,
        pressed && { opacity: 0.65 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{periodLabel(report.periodStart)}</Text>
        <Text style={styles.cardSub}>
          {report.lineCount} {report.lineCount === 1 ? 'item' : 'items'} · {report.invoiceNumber}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.cardAmount}>{fmtCents(report.totalCents)}</Text>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.modern.pageBg },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.modern.pageBg,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  navBack: { fontSize: 17, color: colors.modern.brand },
  navTitle: { fontSize: 17, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 60 },
  header: { paddingTop: 8, paddingBottom: 14 },
  eyebrow: { ...type.eyebrow, fontSize: 10 },
  title: { ...type.h1, marginTop: 4 },
  subtitle: { ...type.bodySmall, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stat: {
    flex: 1, backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.border,
    borderRadius: 12, padding: 12,
  },
  statLabel: {
    fontSize: 10, fontWeight: '500', letterSpacing: 1,
    color: colors.modern.inkTertiary, textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 19, fontWeight: '500', letterSpacing: -0.5,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.border,
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  cardHighlight: { borderColor: 'rgba(38,72,110,0.25)' },
  cardTitle: { fontSize: 15, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.2 },
  cardSub: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 2 },
  cardAmount: {
    fontSize: 16, fontWeight: '500',
    color: colors.modern.ink, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  pillText: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyBox: { paddingVertical: 30, paddingHorizontal: 20 },
  emptyText: {
    fontSize: 13, color: colors.modern.inkTertiary,
    textAlign: 'center', lineHeight: 18,
  },
  organizeBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.modern.amberSoft,
    borderRadius: 12, padding: 12, marginTop: 12,
    borderWidth: 0.5, borderColor: 'rgba(217,119,6,0.2)',
  },
  organizeTitle: { fontSize: 13, fontWeight: '500', color: colors.modern.amberInk },
  organizeSub: { fontSize: 11, color: colors.modern.amberInk, opacity: 0.8, marginTop: 1 },
});
