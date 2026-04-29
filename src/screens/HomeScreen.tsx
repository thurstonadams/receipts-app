// Home screen — refactored to the modern white aesthetic.
//
// Pure white cards on a soft page background, near-black ink, tabular
// numerals. Same information architecture as before (entity pill, summary
// card, Scan / Batch quick actions, Recent + Needs attention sections,
// Reports CTA), just rendered against the modern palette so the whole app
// feels like one product.
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { supabase } from '../lib/supabase';
import { EntityPill } from '../components/EntityPill';
import { Icon, IconName } from '../components/Icon';
import { ReceiptRow } from '../components/ReceiptRow';
import { fmtDateFull } from '../lib/format';
import { colors, type } from '../theme';
import appJson from '../../app.json';

type StatusFilter = null | 'synced' | 'ready' | 'needs-review';
const FILTER_TITLES: Record<Exclude<StatusFilter, null>, string> = {
  synced: 'Synced',
  ready: 'Ready',
  'needs-review': 'Needs review',
};

const BUILD_NUMBER = (appJson as { expo: { ios: { buildNumber: string } } }).expo.ios.buildNumber;
const APP_VERSION = (appJson as { expo: { version: string } }).expo.version;

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
      `Signed in as ${email}\n\nApp version ${APP_VERSION} · Build ${BUILD_NUMBER}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'KAI invoices',
          onPress: () => navigate('reports'),
        },
        {
          text: 'Forwarding addresses',
          onPress: () => navigate('forwarding'),
        },
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.modern.pageBg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.modern.brand}
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
              <Icon name="chevron" size={14} color={colors.modern.amberInk} />
            </Pressable>
          </View>
        )}

        {/* Summary card */}
        <View style={styles.sectionPad}>
          <View style={styles.card}>
            <Text style={styles.cardKicker}>
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()} · UNSUBMITTED
            </Text>
            <View style={styles.amountRow}>
              <Text style={styles.amount}>${stats.total.toFixed(2)}</Text>
              <Text style={styles.amountSub}>across {receiptsForEntity.length} receipts</Text>
            </View>
            <View style={styles.statusBar}>
              <View style={[styles.barSeg, { flex: Math.max(stats.synced, 0.001), backgroundColor: colors.modern.green }]} />
              <View style={[styles.barSeg, { flex: Math.max(stats.ready, 0.001), backgroundColor: colors.modern.brand }]} />
              <View style={[styles.barSeg, { flex: Math.max(stats.review, 0.001), backgroundColor: colors.modern.amber }]} />
            </View>
            <View style={styles.legend}>
              <Legend color={colors.modern.green} label="Synced" n={stats.synced} active={statusFilter === 'synced'} onPress={() => toggleFilter('synced')} />
              <Legend color={colors.modern.brand} label="Ready"  n={stats.ready}  active={statusFilter === 'ready'}  onPress={() => toggleFilter('ready')} />
              <Legend color={colors.modern.amber} label="Review" n={stats.review} active={statusFilter === 'needs-review'} onPress={() => toggleFilter('needs-review')} />
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

        {/* KAI invoices CTA — replaces the old generic "expense report" CTA */}
        {!isPersonal && receiptsForEntity.length > 0 && (
          <View style={styles.sectionPad}>
            <Pressable
              onPress={() => navigate('reports')}
              style={({ pressed }) => [styles.reportCta, pressed && { opacity: 0.88 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.reportKicker}>KAI INVOICES · KALYANI → KAI</Text>
                <Text style={styles.reportTitle}>Open Reports</Text>
                <Text style={styles.reportSub}>
                  Tag receipts as billable, assemble monthly invoice, send to KAI.
                </Text>
              </View>
              <View style={styles.reportChev}>
                <Icon name="chevron" size={16} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
        )}

        {/* Empty state */}
        {receiptsForEntity.length === 0 && (
          <View style={[styles.sectionPad, { paddingTop: 40, alignItems: 'center' }]}>
            <View style={styles.emptyIcon}>
              <Icon name="receipt" size={36} color={colors.modern.inkQuaternary} />
            </View>
            <Text style={styles.emptyTitle}>No receipts yet</Text>
            <Text style={styles.emptySub}>Tap Scan to capture your first one.</Text>
          </View>
        )}

        {/* Build footer — visible at the bottom so any future "is this the right
            build?" question is answered without having to dig. */}
        <View style={styles.buildFooter}>
          <Text style={styles.buildFooterText}>
            Build {BUILD_NUMBER} · v{APP_VERSION}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function IconBtn({ icon, onPress }: { icon: IconName; onPress?: () => void }) {
  return (
    <Pressable style={styles.iconBtn} onPress={onPress}>
      <Icon name={icon} size={20} color={colors.modern.ink} />
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
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.qaIcon, { backgroundColor: primary ? 'rgba(255,255,255,0.10)' : 'rgba(9,9,11,0.05)' }]}>
        <Icon name={icon} size={18} color={primary ? '#FFFFFF' : colors.modern.ink} />
      </View>
      <View>
        <Text style={[styles.qaTitle, { color: primary ? '#FFFFFF' : colors.modern.ink }]}>{title}</Text>
        <Text style={[styles.qaSub, { color: primary ? 'rgba(255,255,255,0.6)' : colors.modern.inkTertiary }]}>{sub}</Text>
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
  kicker: { fontSize: 11, color: colors.modern.inkTertiary, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '500', letterSpacing: -0.7, color: colors.modern.ink, marginTop: 4 },
  titleIcons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 99,
    backgroundColor: 'rgba(9,9,11,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionPad: { paddingHorizontal: 16, paddingTop: 12 },

  card: {
    backgroundColor: colors.modern.surface,
    borderRadius: 16,
    padding: 18,
    paddingBottom: 16,
    borderWidth: 0.5,
    borderColor: colors.modern.border,
  },
  cardKicker: { ...type.eyebrow, fontSize: 10, marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  amount: { fontSize: 32, fontWeight: '500', letterSpacing: -0.8, color: colors.modern.ink, fontVariant: ['tabular-nums'] },
  amountSub: { fontSize: 12, color: colors.modern.inkTertiary },

  statusBar: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: 'rgba(9,9,11,0.05)',
  },
  barSeg: { height: '100%' },
  legend: { flexDirection: 'row', gap: 6, marginTop: 12 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 99,
  },
  legendItemActive: {
    backgroundColor: 'rgba(9,9,11,0.06)',
  },
  legendDot: { width: 6, height: 6, borderRadius: 99 },
  legendLabel: { fontSize: 12, color: colors.modern.inkSecondary },
  legendLabelActive: { color: colors.modern.ink, fontWeight: '500' },
  legendN: { fontSize: 12, color: colors.modern.inkTertiary, fontVariant: ['tabular-nums'] },
  legendNActive: { color: colors.modern.ink },

  filterEmpty: {
    paddingVertical: 20,
    textAlign: 'center',
    color: colors.modern.inkTertiary,
    fontSize: 13,
  },

  actionsRow: { flexDirection: 'row', gap: 10 },
  qa: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  qaDefault: { backgroundColor: colors.modern.surface, borderWidth: 0.5, borderColor: colors.modern.border },
  qaPrimary: { backgroundColor: colors.modern.ink },
  qaIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  qaTitle: { fontSize: 16, fontWeight: '500', letterSpacing: -0.3 },
  qaSub: { fontSize: 12, marginTop: 1 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 6,
  },
  sectionHeaderTitle: { ...type.eyebrow, fontSize: 11 },
  sectionHeaderRight: { fontSize: 12, color: colors.modern.brand, fontWeight: '500' },

  embeddedList: {
    backgroundColor: colors.modern.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.modern.border,
  },

  reportCta: {
    backgroundColor: colors.modern.ink,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportKicker: { ...type.eyebrow, fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  reportTitle: { fontSize: 16, color: '#FFFFFF', fontWeight: '500', letterSpacing: -0.3 },
  reportSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 16 },
  reportChev: {
    width: 32,
    height: 32,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(9,9,11,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },
  emptySub: { fontSize: 13, color: colors.modern.inkTertiary, marginTop: 4 },

  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.modern.amberSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(217,119,6,0.2)',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.modern.amber,
  },
  syncText: {
    flex: 1,
    fontSize: 13,
    color: colors.modern.amberInk,
    fontWeight: '500',
  },

  buildFooter: {
    paddingTop: 28,
    paddingBottom: 12,
    alignItems: 'center',
  },
  buildFooterText: {
    fontSize: 10,
    color: colors.modern.inkQuaternary,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
});
