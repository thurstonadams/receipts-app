// Full-text search across the current entity's receipts. Matches across
// vendor, category, code, notes, project and payment. Ranked rough-best-first:
// an exact-prefix vendor match beats a substring match in notes.
import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { ReceiptRow } from '../components/ReceiptRow';
import { colors } from '../theme';
import { Receipt } from '../types';

function scoreMatch(r: Receipt, qLower: string): number {
  if (!qLower) return 0;
  const vendor = r.vendor.toLowerCase();
  if (vendor.startsWith(qLower)) return 100;
  if (vendor.includes(qLower)) return 80;
  if ((r.category ?? '').toLowerCase().includes(qLower)) return 50;
  if ((r.project ?? '').toLowerCase().includes(qLower)) return 40;
  if ((r.payment ?? '').toLowerCase().includes(qLower)) return 30;
  if ((r.notes ?? '').toLowerCase().includes(qLower)) return 20;
  if ((r.categoryCode ?? '').toLowerCase().includes(qLower)) return 15;
  return 0;
}

export function SearchScreen() {
  const { navigate, receiptsForEntity, currentEntity } = useStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    // Auto-focus the search field a tick after mount so the keyboard pops up.
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = receiptsForEntity
      .map(r => ({ r, score: scoreMatch(r, q) }))
      .filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score || b.r.updatedAt - a.r.updatedAt);
    return scored.map(x => x.r);
  }, [receiptsForEntity, query]);

  const clearQuery = () => { setQuery(''); inputRef.current?.focus(); };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => { Keyboard.dismiss(); navigate('home'); }}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Search · {currentEntity.short}</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Icon name="search" size={16} color="rgba(60,60,67,0.4)" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Vendor, category, notes…"
            placeholderTextColor="rgba(60,60,67,0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={clearQuery} hitSlop={10}>
              <Icon name="xMark" size={14} color="rgba(60,60,67,0.45)" />
            </Pressable>
          )}
        </View>
      </View>

      {query.trim().length === 0 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Start typing to search your receipts.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>No receipts match “{query}”.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.listPad}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.count}>
              {results.length} result{results.length === 1 ? '' : 's'}
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.rowWrap, index === results.length - 1 && { marginBottom: 0 }]}>
              <ReceiptRow receipt={item} onPress={() => navigate('review', item.id)} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
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
  searchRow: { paddingHorizontal: 16, paddingVertical: 4 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.12)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 0,
  },
  hint: {
    paddingHorizontal: 32,
    paddingTop: 40,
    alignItems: 'center',
  },
  hintText: { fontSize: 14, color: 'rgba(60,60,67,0.55)', textAlign: 'center' },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(60,60,67,0.55)',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  rowWrap: {},
});
