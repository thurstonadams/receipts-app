import React, { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { ReceiptRow } from '../components/ReceiptRow';
import { colors, fonts } from '../theme';

export function ReportScreen() {
  const { navigate, currentEntity, receiptsForEntity } = useStore();

  // Include synced + ready (exportable + already-exported).
  const included = useMemo(
    () => receiptsForEntity.filter(r => r.status !== 'needs-review'),
    [receiptsForEntity]
  );
  const total = included.reduce((s, r) => s + r.total, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    included.forEach(r => map.set(r.category, (map.get(r.category) ?? 0) + r.total));
    const arr = Array.from(map.entries()).map(([cat, amt]) => ({ cat, amt }));
    arr.sort((a, b) => b.amt - a.amt);
    return arr;
  }, [included]);

  const maxCat = byCategory[0]?.amt ?? 1;

  const dateRange = useMemo(() => {
    if (included.length === 0) return '';
    const dates = included.map(r => r.date).sort();
    return `${dates[0]} – ${dates[dates.length - 1]}`;
  }, [included]);

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Expense Report</Text>
        <View style={{ width: 80 }} />
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 140 }}
        data={included}
        keyExtractor={r => r.id}
        renderItem={({ item, index }) => (
          <View style={styles.sectionPad}>
            <View style={[styles.receiptRowWrap, index === 0 && styles.receiptRowWrapFirst, index === included.length - 1 && styles.receiptRowWrapLast]}>
              <ReceiptRow
                receipt={item}
                onPress={() => navigate('review', item.id)}
                embedded
                isLast={index === included.length - 1}
              />
            </View>
          </View>
        )}
        ListHeaderComponent={
          <>
            <View style={styles.summary}>
              <Text style={styles.kicker}>REPORT · {monthLabel} · {currentEntity.short.toUpperCase()}</Text>
              <Text style={[styles.total, { fontFamily: fonts.sfMono }]}>${total.toFixed(2)}</Text>
              <Text style={styles.sub}>
                {included.length} receipt{included.length === 1 ? '' : 's'}
                {dateRange ? ` · ${dateRange}` : ''}
              </Text>
            </View>
            {byCategory.length > 0 && (
              <View style={styles.sectionPad}>
                <View style={styles.card}>
                  <Text style={styles.cardHeader}>BY CATEGORY</Text>
                  {byCategory.map(b => (
                    <View key={b.cat} style={styles.catRow}>
                      <View style={styles.catTextRow}>
                        <Text style={styles.catLabel} numberOfLines={1}>{b.cat}</Text>
                        <Text style={[styles.catAmt, { fontFamily: fonts.sfMono }]}>${b.amt.toFixed(2)}</Text>
                      </View>
                      <View style={styles.catBarBg}>
                        <View style={[styles.catBar, { width: `${(b.amt / maxCat) * 100}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {included.length > 0 && (
              <View style={[styles.sectionPad, styles.listHeaderRow]}>
                <Text style={styles.listHeader}>RECEIPTS</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={[styles.sectionPad, { alignItems: 'center', paddingTop: 40 }]}>
            <Text style={styles.emptyTitle}>No receipts in this report</Text>
            <Text style={styles.emptySub}>Capture and review receipts to see them here.</Text>
          </View>
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <Pressable
          onPress={() => navigate('sync')}
          disabled={included.length === 0}
          style={({ pressed }) => [
            styles.exportBtn,
            included.length === 0 && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Icon name="send" size={16} color="#fff" />
          <Text style={styles.exportText}>Export CSV</Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, minWidth: 80 },
  navBack: { color: colors.accent, fontSize: 17 },
  navTitle: { fontSize: 17, fontWeight: '600' },
  summary: { paddingHorizontal: 20, paddingVertical: 16 },
  kicker: { fontSize: 13, color: 'rgba(60,60,67,0.6)', fontWeight: '500', marginBottom: 2 },
  total: { fontSize: 42, fontWeight: '600', letterSpacing: -1.2, color: '#000' },
  sub: { fontSize: 13, color: 'rgba(60,60,67,0.6)' },
  sectionPad: { paddingHorizontal: 16, paddingTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(60,60,67,0.55)',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  catRow: { marginBottom: 10 },
  catTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catLabel: { fontSize: 13, color: '#000', flex: 1 },
  catAmt: { fontSize: 13, fontWeight: '500' },
  catBarBg: { height: 3, borderRadius: 2, backgroundColor: 'rgba(60,60,67,0.06)', overflow: 'hidden' },
  catBar: { height: '100%', backgroundColor: colors.accent },
  listHeaderRow: { paddingTop: 18, paddingBottom: 4 },
  listHeader: { fontSize: 11, fontWeight: '600', color: 'rgba(60,60,67,0.55)', letterSpacing: 0.4 },
  receiptList: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  receiptRowWrap: {
    backgroundColor: '#fff',
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
    overflow: 'hidden',
  },
  receiptRowWrapFirst: {
    borderTopWidth: 0.5,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  receiptRowWrapLast: {
    borderBottomWidth: 0.5,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  emptySub: { fontSize: 13, color: 'rgba(60,60,67,0.6)', marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 8 },
  exportBtn: {
    backgroundColor: colors.accent,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
