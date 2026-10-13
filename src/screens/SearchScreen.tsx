// All receipts + search for the current book. With no query it lists every
// receipt, newest first (this is where Home's "See all" lands). Typing filters
// by vendor, amount ("58.30" / "58,30"), date ("Jul 29", "2026-07"),
// category, notes, project and payment. Matching lives in lib/search.ts.
import React, { useMemo, useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { ReceiptRow } from '../components/ReceiptRow';
import { colors } from '../theme';
import { searchReceipts } from '../lib/search';

// Survives the trip into a receipt and back, so the list stays where it was.
let lastQuery = '';

export function SearchScreen() {
  const { navigate, receiptsForEntity, currentEntity } = useStore();
  const [query, setQueryState] = useState(lastQuery);
  const setQuery = (q: string) => { lastQuery = q; setQueryState(q); };
  const inputRef = useRef<TextInput | null>(null);

  // No auto-focus: "See all" opens this as a list, and a keyboard popping up
  // would cover it. Tap the field to search.

  const results = useMemo(() => searchReceipts(receiptsForEntity, query), [receiptsForEntity, query]);
  const isAll = query.trim().length === 0;

  const clearQuery = () => { setQuery(''); inputRef.current?.focus(); };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => { Keyboard.dismiss(); navigate('home'); }}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>{isAll ? 'All receipts' : 'Search'} · {currentEntity.short}</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Icon name="search" size={16} color="rgba(60,60,67,0.4)" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Vendor, amount, date (Jul 29)…"
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

      {results.length === 0 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {isAll ? 'No receipts in this book yet.' : `No receipts match “${query}”.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.listPad}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          windowSize={7}
          ListHeaderComponent={
            <Text style={styles.count}>
              {isAll
                ? `All receipts · ${results.length} · newest first`
                : `${results.length} result${results.length === 1 ? '' : 's'}`}
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
