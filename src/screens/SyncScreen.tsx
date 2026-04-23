// Sync screen — repurposed as Export.
// Shows the set of receipts ready to leave the app and offers a CSV export
// via the native share sheet (email, AirDrop, Files, etc.).
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { exportReceiptsCsv, defaultExportFilename } from '../lib/exportCsv';
import { colors, fonts } from '../theme';

export function SyncScreen() {
  const { navigate, currentEntity, receiptsForEntity, updateReceipt } = useStore();
  const exportable = useMemo(
    () => receiptsForEntity.filter(r => r.status === 'ready' || r.status === 'synced'),
    [receiptsForEntity]
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const total = exportable.reduce((s, r) => s + r.total, 0);

  const handleExport = async () => {
    if (exportable.length === 0) {
      Alert.alert('Nothing to export', 'Mark at least one receipt as ready first.');
      return;
    }
    setBusy(true);
    try {
      const filename = defaultExportFilename(currentEntity.id);
      await exportReceiptsCsv(exportable, filename);
      // Mark ready receipts as synced (user has handed the data off).
      exportable.forEach(r => {
        if (r.status === 'ready') updateReceipt({ ...r, status: 'synced' });
      });
      setDone(true);
    } catch (err) {
      Alert.alert('Export failed', String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Export</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {done ? (
          <View style={styles.donePanel}>
            <View style={styles.doneCircle}>
              <Icon name="check" size={36} color={colors.success} />
            </View>
            <Text style={styles.doneTitle}>Exported</Text>
            <Text style={styles.doneSub}>
              {exportable.length} receipt{exportable.length === 1 ? '' : 's'} · ${total.toFixed(2)}
              {'\n'}Marked as synced.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => navigate('home')}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.sectionPad}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.csvIcon}>
                    <Text style={styles.csvIconText}>CSV</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Export as CSV</Text>
                    <Text style={styles.cardSub}>{currentEntity.name}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <SummaryRow label="Receipts" value={String(exportable.length)} />
                <SummaryRow label="Total" value={`$${total.toFixed(2)} USD`} mono />
                <SummaryRow
                  label="Filename"
                  value={defaultExportFilename(currentEntity.id)}
                  small
                />
              </View>
            </View>

            <View style={styles.sectionPad}>
              <Text style={styles.helpText}>
                Tap Export to open the iOS share sheet. You can email the CSV to your accountant, save it to Files, send it
                to QuickBooks, or AirDrop it to another device.
              </Text>
            </View>

            {exportable.length > 0 && (
              <View style={styles.sectionPad}>
                <Text style={styles.groupHeader}>INCLUDED</Text>
                <View style={styles.list}>
                  {exportable.slice(0, 8).map((r, i) => (
                    <View
                      key={r.id}
                      style={[styles.row, i < Math.min(exportable.length, 8) - 1 && styles.rowDivider]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{r.vendor || '(no vendor)'}</Text>
                        <Text style={styles.rowMeta}>
                          {r.date} · {r.category}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmt, { fontFamily: fonts.sfMono }]}>
                        ${r.total.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  {exportable.length > 8 && (
                    <Text style={styles.moreText}>+ {exportable.length - 8} more</Text>
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!done && (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <Pressable
            onPress={handleExport}
            disabled={busy || exportable.length === 0}
            style={({ pressed }) => [
              styles.primaryBtn,
              (busy || exportable.length === 0) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="send" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  Export {exportable.length} receipt{exportable.length === 1 ? '' : 's'}
                </Text>
              </>
            )}
          </Pressable>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          mono && { fontFamily: fonts.sfMono },
          small && { fontSize: 12, color: 'rgba(60,60,67,0.55)' },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
  sectionPad: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  csvIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvIconText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSub: { fontSize: 12, color: 'rgba(60,60,67,0.6)', marginTop: 1 },
  divider: { height: 0.5, backgroundColor: 'rgba(60,60,67,0.08)', marginVertical: 4 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: { fontSize: 13, color: 'rgba(60,60,67,0.6)' },
  summaryValue: { fontSize: 14, fontWeight: '500', color: '#000', maxWidth: '60%' },
  helpText: { fontSize: 13, color: 'rgba(60,60,67,0.6)', lineHeight: 18 },
  groupHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(60,60,67,0.55)',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  list: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(60,60,67,0.08)' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#000' },
  rowMeta: { fontSize: 12, color: 'rgba(60,60,67,0.55)', marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: '600' },
  moreText: { paddingVertical: 10, textAlign: 'center', color: 'rgba(60,60,67,0.55)', fontSize: 12 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  donePanel: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  doneCircle: {
    width: 80,
    height: 80,
    borderRadius: 99,
    backgroundColor: 'rgba(46,95,90,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4, marginBottom: 8 },
  doneSub: { fontSize: 14, color: 'rgba(60,60,67,0.65)', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
});
