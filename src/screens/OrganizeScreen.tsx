// Organize sweep — Triage's twin for tagging the scattered backlog.
//
// Presents each receipt that hasn't been touched yet (billableTo === undefined)
// as a single card with three decisions:
//   - Bill to KAI    → set billableTo = 'kai'
//   - Not billable   → set billableTo = null  (decisively "no")
//   - Skip           → leave undefined (revisit later)
//
// AI-pre-suggestion is heuristic: vendors that match common KAI-billable
// software/services get a soft default of "Bill to KAI". User can override
// with a tap; the suggestion is just a default, not a forced answer.
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { Receipt } from '../types';
import { colors, type } from '../theme';

// Vendors most likely to be billable passthrough (rough first-cut). User can
// extend this dictionary by tagging — once the data shows a pattern we'll
// learn from it.
const LIKELY_BILLABLE_VENDORS = new Set([
  'anthropic',
  'aws',
  'amazon web services',
  'hostinger',
  'postmark',
  'supabase',
  'github',
  'vercel',
  'netlify',
  'cloudflare',
  'sentry',
  'datadog',
  'openai',
]);

function suggestsBillable(receipt: Receipt): boolean {
  const v = receipt.vendor.trim().toLowerCase();
  return LIKELY_BILLABLE_VENDORS.has(v);
}

export function OrganizeScreen() {
  const { state, navigate, updateReceipt } = useStore();
  const insets = useSafeAreaInsets();

  // Receipts that still need a decision — billableTo is undefined.
  // Note: explicit null means "decided not billable", and 'kai' means yes.
  const unfiled: Receipt[] = useMemo(
    () => state.receipts.filter(r => r.billableTo === undefined).sort((a, b) => b.createdAt - a.createdAt),
    [state.receipts],
  );

  const [index, setIndex] = useState(0);
  const current = unfiled[index];
  const remaining = unfiled.length - index;

  const tag = (next: 'kai' | null) => {
    if (!current) return;
    updateReceipt({ ...current, billableTo: next });
    // Don't advance index — the unfiled list will shrink because of the filter,
    // and the "next" card slides into position naturally.
  };

  const skip = () => {
    setIndex(i => i + 1);
  };

  if (!current) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
            <Icon name="chevronLeft" size={20} color={colors.modern.brand} />
            <Text style={styles.navBack}>Home</Text>
          </Pressable>
          <Text style={styles.navTitle}>Organize</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={styles.empty}>
          <View style={styles.checkCircle}>
            <Icon name="check" size={28} color="#FFF" />
          </View>
          <Text style={styles.emptyTitle}>All organized.</Text>
          <Text style={styles.emptySub}>
            Every receipt has a billing decision. New receipts that come in
            will surface here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const suggested = suggestsBillable(current);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.modern.brand} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Organize</Text>
        <Text style={styles.counter}>{remaining} left</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <Text style={type.eyebrow}>Bill to KAI?</Text>
          <Text style={styles.title}>{current.vendor || 'Unknown vendor'}</Text>
          <Text style={styles.subtitle}>
            {current.date} · ${current.total.toFixed(2)} · {current.category || 'Uncategorized'}
          </Text>
          {current.notes ? (
            <Text style={styles.notes}>"{current.notes}"</Text>
          ) : null}
        </View>

        {suggested && (
          <View style={styles.suggestionPill}>
            <Icon name="bolt" size={12} color={colors.modern.amberInk} />
            <Text style={styles.suggestionText}>
              Vendor often appears on KAI invoices. Suggested: bill to KAI.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.btnPrimary,
              suggested && styles.btnPrimarySuggested,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => tag('kai')}
          >
            <Text style={styles.btnPrimaryText}>Bill to KAI</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.6 }]}
            onPress={() => tag(null)}
          >
            <Text style={styles.btnSecondaryText}>Not billable</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.6 }]}
            onPress={skip}
          >
            <Text style={styles.btnGhostText}>Skip for now</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footnote, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Text style={styles.footnoteText}>
          You can re-tag any receipt later from its Edit screen.
        </Text>
      </View>
    </SafeAreaView>
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
  counter: { width: 80, textAlign: 'right', fontSize: 12, color: colors.modern.inkTertiary },

  scroll: { padding: 20, paddingBottom: 40 },
  headerBlock: {
    backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.border,
    borderRadius: 16, padding: 18,
    marginTop: 6,
  },
  title: { ...type.h1, fontSize: 22, marginTop: 8 },
  subtitle: { ...type.bodySmall, marginTop: 4, fontVariant: ['tabular-nums'] },
  notes: { fontSize: 12, color: colors.modern.inkSecondary, marginTop: 10, fontStyle: 'italic' },

  suggestionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.modern.amberSoft,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 99,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  suggestionText: { fontSize: 11, color: colors.modern.amberInk, fontWeight: '500' },

  actions: { marginTop: 24, gap: 8 },
  btnPrimary: {
    backgroundColor: colors.modern.ink,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  btnPrimarySuggested: { backgroundColor: colors.modern.brand },
  btnPrimaryText: { color: colors.modern.surface, fontSize: 15, fontWeight: '500' },
  btnSecondary: {
    backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.borderStrong,
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '500', color: colors.modern.ink },
  btnGhost: { paddingVertical: 11, alignItems: 'center' },
  btnGhostText: { fontSize: 13, color: colors.modern.inkTertiary },

  footnote: { paddingHorizontal: 20, paddingTop: 8 },
  footnoteText: { fontSize: 11, color: colors.modern.inkTertiary, textAlign: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
  checkCircle: {
    width: 56, height: 56, borderRadius: 99,
    backgroundColor: colors.modern.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },
  emptySub: { fontSize: 13, color: colors.modern.inkTertiary, textAlign: 'center', lineHeight: 18 },
});
