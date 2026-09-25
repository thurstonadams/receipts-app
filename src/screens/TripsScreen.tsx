// Trips — date ranges that decide which book a receipt lands in.
//
// A receipt charged (or, for a prepaid hotel/flight, used) inside a trip is
// filed in that trip's book by the email import, and new captures during a
// trip default to it. KAI trips also turn on "Bill to KAI" for travel and
// meals. Rule lives in supabase/functions/_shared/filing.ts.
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { colors, radius } from '../theme';
import { Trip } from '../types';
import { fmtDate, todayISO, uid } from '../lib/format';
import { validateTrip } from '../lib/trips';

type Book = Trip['entityId'];

export function TripsScreen() {
  const { trips, entities, saveTrip, removeTrip, navigate } = useStore();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [book, setBook] = useState<Book>('kai');

  const today = todayISO();
  const bookOf = (id: string) => entities.find(e => e.id === id);

  const handleAdd = async () => {
    const err = validateTrip({ name, startDate: start.trim(), endDate: end.trim() });
    if (err) { Alert.alert("Can't save trip", err); return; }
    setBusy(true);
    try {
      const now = Date.now();
      await saveTrip({
        id: uid('t'), name: name.trim(), startDate: start.trim(), endDate: end.trim(),
        entityId: book, notes: '', createdAt: now, updatedAt: now,
      });
      setAdding(false);
      setName('');
    } catch (e) {
      Alert.alert("Couldn't save trip", e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (t: Trip) => {
    try {
      await saveTrip({ ...t, notes: '' });
    } catch (e) {
      Alert.alert("Couldn't update trip", e instanceof Error ? e.message : 'Try again.');
    }
  };

  const handleDelete = (t: Trip) => {
    Alert.alert(
      `Delete "${t.name}"?`,
      'Receipts already filed stay where they are. New receipts in these dates will use the forwarding address again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { await removeTrip(t.id); }
            catch (e) { Alert.alert("Couldn't delete trip", e instanceof Error ? e.message : 'Try again.'); }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Trips</Text>
        <Pressable style={[styles.navBtn, { justifyContent: 'flex-end' }]} onPress={() => setAdding(a => !a)} hitSlop={8}>
          <Text style={styles.navAction}>{adding ? 'Cancel' : 'Add'}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <Text style={styles.heroKicker}>DATES → BOOK</Text>
            <Text style={styles.heroTitle}>Receipts from a trip file themselves</Text>
            <Text style={styles.heroBody}>
              Anything charged during a trip, or a hotel or flight used during it, goes into
              the trip's book. KAI trips also mark travel and meals "Bill to KAI". Software
              always stays in xFix.
            </Text>
          </View>

          {adding && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                value={name} onChangeText={setName} placeholder="e.g. Pune plant visit"
                placeholderTextColor={colors.textTertiary} style={styles.input} autoFocus
              />
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>FROM</Text>
                  <TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textTertiary} style={styles.input}
                    autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>TO</Text>
                  <TextInput value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textTertiary} style={styles.input}
                    autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
              </View>
              <Text style={styles.fieldLabel}>BOOK</Text>
              <View style={styles.segRow}>
                {entities.map(e => (
                  <Pressable key={e.id} onPress={() => setBook(e.id as Book)}
                    style={[styles.seg, book === e.id && { backgroundColor: e.color, borderColor: e.color }]}>
                    <Text style={[styles.segText, book === e.id && { color: '#fff' }]}>{e.short}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={handleAdd} disabled={busy}
                style={({ pressed }) => [styles.saveBtn, (pressed || busy) && { opacity: 0.7 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save trip</Text>}
              </Pressable>
            </View>
          )}

          {trips.length === 0 && !adding && (
            <Text style={styles.empty}>No trips yet. Tap Add before you travel.</Text>
          )}

          {trips.map(t => {
            const e = bookOf(t.entityId);
            const now = t.startDate <= today && today <= t.endDate;
            return (
              <View key={t.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.swatch, { backgroundColor: e?.color ?? '#999' }]}>
                    <Text style={styles.swatchText}>{e?.mark ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{t.name}{now ? '  · now' : ''}</Text>
                    <Text style={styles.cardSubtitle}>
                      {fmtDate(t.startDate)} – {fmtDate(t.endDate)}, {t.endDate.slice(0, 4)} · {e?.short ?? t.entityId}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDelete(t)} hitSlop={10} style={styles.deleteBtn}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
                {!!t.notes && (
                  <View style={styles.noteRow}>
                    <Text style={styles.noteText}>{t.notes}</Text>
                    <Pressable onPress={() => handleConfirm(t)} hitSlop={8}>
                      <Text style={styles.noteAction}>Dates are right</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 8, width: 80 },
  navBack: { fontSize: 17, color: colors.accent },
  navAction: { fontSize: 17, color: colors.accent, fontWeight: '600' },
  navTitle: { fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 60, gap: 14 },
  heroCard: {
    backgroundColor: '#fff', borderRadius: radius.card, padding: 18,
    borderWidth: 0.5, borderColor: colors.separator,
  },
  heroKicker: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.6, marginBottom: 6 },
  heroTitle: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: -0.4, marginBottom: 8 },
  heroBody: { fontSize: 14, lineHeight: 20, color: colors.text },
  card: {
    backgroundColor: '#fff', borderRadius: radius.card, padding: 16,
    borderWidth: 0.5, borderColor: colors.separator, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  swatchText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  deleteText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  noteRow: {
    backgroundColor: colors.modern.amberSoft, borderRadius: 10, padding: 10, gap: 6,
  },
  noteText: { fontSize: 12, color: colors.modern.amberInk },
  noteAction: { fontSize: 13, color: colors.modern.amberInk, fontWeight: '700' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.6 },
  input: {
    borderWidth: 0.5, borderColor: colors.separator, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text, backgroundColor: '#FAFAFA',
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
    borderWidth: 0.5, borderColor: colors.separator, backgroundColor: '#FAFAFA',
  },
  segText: { fontSize: 14, fontWeight: '600', color: colors.text },
  saveBtn: {
    marginTop: 4, backgroundColor: colors.accent, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textSecondary, fontSize: 14, marginTop: 20 },
});
