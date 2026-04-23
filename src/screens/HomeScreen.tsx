import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { supabase } from '../lib/supabase';
import { EntityPill } from '../components/EntityPill';
import { Icon, IconName } from '../components/Icon';
import { ReceiptRow } from '../components/ReceiptRow';
import { fmtDateFull } from '../lib/format';
import { colors, fonts } from '../theme';

type StatusFilter = null | 'synced' | 'ready' | 'needs-review';
const FILTER_TITLES: Record<Exclude<StatusFilter, null>, string> = {
  synced: 'Synced',
  ready: 'Ready',
  'needs-review': 'Needs review',
};

export function HomeScreen({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const { currentEntity, receiptsForEntity, navigate, unsyncedCount, retryPendingSync, refreshFromCloud } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  const toggleFilter = (s: Exclude<StatusFilter, null>) =>
    setStatusFilter(prev => (prev === s ? null : s));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshFromCloud(), retryPendingSync()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshFromCloud, retryPendingSync]);

  const handleProfilePress = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? 'this account';
    Alert.alert(
      'Account',
      `Signed in as ${email}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => { supabase.auth.signOut(); },
        },
      ],
    );
  };

  const stats = useMemo(() => {
    const total = receiptsForEntity.reduce((s, r) => s + r.total, 0);
    const review = receiptsForEntity.filter(r => r.status === 'needs-review').length;
    const ready = receiptsForEntity.filter(r => r.status === 'ready').length;
    const synced = receiptsForEntity.filter(r => r.status === 'synced').length;
    return { total, review, ready, synced };
  }, [receiptsForEntity]);

  const isPersonal = currentEntity.id === 'personal';
  const today = fmtDateFull(new Date().toISOString().slice(0, 10));
  const needsAttention = receiptsForEntity.filter(r => r.status === 'needs-review');
  const recent = receiptsForEntity.filter(r => r.status !== 'needs-review').slice(0, 6);
  const filtered = statusFilter
    ? receiptsForEntity.filter(r => r.status === statusFilter)
    : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Entity pill */}
        <View style={styles.pillRow}>
          <EntityPill entity={currentEntity} onPress={onOpenSwitcher} />
        </View>

        {/* Title row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.kicker}>{today.toUpperCase()}</Text>
            <Text style={styles.title}>{currentEntity.short === 'Personal' ? 'Personal' : currentEntity.short}</Text>
          </View>
          <View style={styles.titleIcons}>
            <IconBtn icon="search" onPress={() => navigate('search')} />
            <IconBtn icon="user" onPress={handleProfilePress} />
          </View>
        </View>

        {/* Unsynced banner */}
        {unsyncedCount > 0 && (
          <View style={styles.sectionPad}>
            <Pressable
              onPress={() => { retryPendingSync(); }}
              style={({ pressed }) => [styles.syncBanner, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.syncDot} />
              <Text style={styles.syncText} numberOfLines={1}>
                {unsyncedCount} receipt{unsyncedCount === 1 ? '' : 's'} not backed up — tap to retry
              </Text>
              <Icon name="chevron" size={14} color={colors.warning} />
            </Pressable>
          </View>
        )}

        {/* Summary card */}
        <View style={styles.sectionPad}>
          <View style={styles.card}>
            <Text style={styles.cardKicker}>
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Unsubmitted
            </Text>
            <View style={styles.amountRow}>
              <Text style={styles.amount}>${stats.total.toFixed(2)}</Text>
              <Text style={styles.amountSub}>across {receiptsForEntity.length} receipts</Text>
            </View>
            <View style={styles.statusBar}>
              <View style={[styles.barSeg, { flex: Math.max(stats.synced, 0.001), backgroundColor: colors.success }]} />
              <View style={[styles.barSeg, { flex: Math.max(stats.ready, 0.001), backgroundColor: colors.accent }]} />
              <View style={[styles.barSeg, { flex: Math.max(stats.review, 0.001), backgroundColor: colors.warning }]} />
            </View>
            <View style={styles.legend}>
              <Legend color={colors.success} label="Synced" n={stats.synced} active={statusFilter === 'synced'} onPress={() => toggleFilter('synced')} />
              <Legend color={colors.accent}  label="Ready"  n={stats.ready}  active={statusFilter === 'ready'}  onPress={() => toggleFilter('ready')} />
              <Legend color={colors.warning} label="Review" n={stats.review} active={statusFilter === 'needs-review'} onPress={() => toggleFilter('needs-review')} />
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={[styles.sectionPad, styles.actionsRow]}>
          <QuickAction primary icon="camera" title="Scan" sub="Single receipt" onPress={() => navigate('capture')} />
          <QuickAction icon="layers" title="Batch" sub="Multiple at once" onPress={() => navigate('batch')} />
        </View>

        {/* Filtered list (takes over when a legend chip is active) */}
        {statusFilter !== null ? (
          <>
            <SectionHeader
              title={FILTER_TITLES[statusFilter]}
              right={`${filtered.length} item${filtered.length === 1 ? '' : 's'} · clear`}
              onRightPress={() => setStatusFilter(null)}
            />
            <View style={styles.sectionPad}>
              {filtered.length > 0 ? (
                <View style={styles.embeddedList}>
                  {filtered.map((r, i) => (
                    <ReceiptRow
                      key={r.id}
                      receipt={r}
                      onPress={() => navigate('review', r.id)}
                      embedded
                      isLast={i === filtered.length - 1}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.filterEmpty}>No {FILTER_TITLES[statusFilter].toLowerCase()} receipts.</Text>
              )}
            </View>
          </>
        ) : (
          <>
            {/* Needs attention */}
            {needsAttention.length > 0 && (
              <>
                <SectionHeader title="Needs attention" right={`${needsAttention.length} item${needsAttention.length === 1 ? '' : 's'}`} />
                <View style={styles.sectionPad}>
                  {needsAttention.map(r => (
                    <ReceiptRow key={r.id} receipt={r} onPress={() => navigate('review', r.id)} highlight />
                  ))}
                </View>
              </>
            )}

            {/* Recent */}
            {recent.length > 0 && (
              <>
                <SectionHeader title="Recent" right="See all" />
                <View style={styles.sectionPad}>
                  <View style={styles.embeddedList}>
                    {recent.map((r, i) => (
                      <ReceiptRow
                        key={r.id}
                        receipt={r}
                        onPress={() => navigate('review', r.id)}
                        embedded
                        isLast={i === recent.length - 1}
                      />
                    ))}
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {/* Expense report CTA */}
        {!isPersonal && receiptsForEntity.length > 0 && (
          <View style={styles.sectionPad}>
            <Pressable
              onPress={() => navigate('report')}
              style={({ pressed }) => [styles.reportCta, pressed && { opacity: 0.85 }]}
            >
              <View>
                <Text style={styles.reportKicker}>Ready to file · {currentEntity.short}</Text>
                <Text style={styles.reportTitle}>Review expense report</Text>
                <Text style={styles.reportSub}>
                  {stats.synced + stats.ready} items · ${stats.total.toFixed(2)}
                </Text>
              </View>
              <View style={styles.reportChev}>
                <Icon name="chevron" size={16} color="#fff" />
              </View>
            </Pressable>
          </View>
        )}

        {/* Empty state */}
        {receiptsForEntity.length === 0 && (
          <View style={[styles.sectionPad, { paddingTop: 40, alignItems: 'center' }]}>
            <View style={styles.emptyIcon}>
              <Icon name="receipt" size={36} color="rgba(60,60,67,0.4)" />
            </View>
            <Text style={styles.emptyTitle}>No receipts yet</Text>
            <Text style={styles.emptySub}>Tap Scan to capture your first one.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IconBtn({ icon, onPress }: { icon: IconName; onPress?: () => void }) {
  return (
    <Pressable style={styles.iconBtn} onPress={onPress}>
      <Icon name={icon} size={20} color={colors.accent} />
    </Pressable>
  );
}

function Legend({ color, label, n, active, onPress }: { color: string; label: string; n: number; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.legendItem, active && styles.legendItemActive, pressed && { opacity: 0.6 }]}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, active && styles.legendLabelActive]}>{label}</Text>
      <Text style={[styles.legendN, active && styles.legendNActive]}>{n}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, right, onRightPress }: { title: string; right?: string; onRightPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{title.toUpperCase()}</Text>
      {right && (
        onRightPress
          ? <Pressable onPress={onRightPress}><Text style={styles.sectionHeaderRight}>{right}</Text></Pressable>
          : <Text style={styles.sectionHeaderRight}>{right}</Text>
      )}
    </View>
  );
}

function QuickAction({
  primary,
  icon,
  title,
  sub,
  onPress,
}: {
  primary?: boolean;
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.qa,
        primary ? styles.qaPrimary : styles.qaDefault,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.qaIcon, { backgroundColor: primary ? 'rgba(255,255,255,0.12)' : 'rgba(38,72,110,0.08)' }]}>
        <Icon name={icon} size={18} color={primary ? '#fff' : colors.accent} />
      </View>
      <View>
        <Text style={[styles.qaTitle, { color: primary ? '#fff' : '#000' }]}>{title}</Text>
        <Text style={[styles.qaSub, { color: primary ? 'rgba(255,255,255,0.65)' : 'rgba(60,60,67,0.55)' }]}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillRow: { padding: 16, alignItems: 'center' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  kicker: { fontSize: 13, color: 'rgba(60,60,67,0.6)', fontWeight: '500', letterSpacing: 0.1 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, color: '#000', marginTop: 2 },
  titleIcons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 99,
    backgroundColor: 'rgba(60,60,67,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionPad: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    paddingBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  cardKicker: { fontSize: 13, color: 'rgba(60,60,67,0.6)', fontWeight: '500', marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  amount: { fontFamily: fonts.sfMono, fontSize: 34, fontWeight: '600', letterSpacing: -1, color: '#000' },
  amountSub: { fontSize: 13, color: 'rgba(60,60,67,0.6)' },
  statusBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: 'rgba(60,60,67,0.06)',
  },
  barSeg: { height: '100%' },
  legend: { flexDirection: 'row', gap: 8, marginTop: 10 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 99,
  },
  legendItemActive: {
    backgroundColor: 'rgba(60,60,67,0.08)',
  },
  legendDot: { width: 6, height: 6, borderRadius: 99 },
  legendLabel: { fontSize: 12, color: 'rgba(60,60,67,0.7)' },
  legendLabelActive: { color: '#000', fontWeight: '600' },
  legendN: { fontSize: 12, color: 'rgba(60,60,67,0.5)' },
  legendNActive: { color: '#000' },
  filterEmpty: {
    paddingVertical: 20,
    textAlign: 'center',
    color: 'rgba(60,60,67,0.55)',
    fontSize: 13,
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  qa: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  qaDefault: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: 'rgba(60,60,67,0.08)' },
  qaPrimary: { backgroundColor: '#1C1C1E' },
  qaIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  qaTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  qaSub: { fontSize: 12, marginTop: 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 6,
  },
  sectionHeaderTitle: { fontSize: 13, fontWeight: '600', color: 'rgba(60,60,67,0.6)', letterSpacing: 0.2 },
  sectionHeaderRight: { fontSize: 13, color: colors.accent, fontWeight: '500' },
  embeddedList: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  reportCta: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    padding: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportKicker: { fontSize: 13, opacity: 0.75, color: '#fff', fontWeight: '500', marginBottom: 2 },
  reportTitle: { fontSize: 17, color: '#fff', fontWeight: '600', letterSpacing: -0.3 },
  reportSub: { fontSize: 13, opacity: 0.75, color: '#fff', marginTop: 2 },
  reportChev: {
    width: 36,
    height: 36,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(60,60,67,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  emptySub: { fontSize: 13, color: 'rgba(60,60,67,0.6)', marginTop: 4 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(194,91,58,0.10)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(194,91,58,0.22)',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.warning,
  },
  syncText: {
    flex: 1,
    fontSize: 13,
    color: colors.warningText,
    fontWeight: '500',
  },
});
