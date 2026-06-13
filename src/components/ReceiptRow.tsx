// Receipt row — single line item used on Home, Search, and any list view.
//
// Refactored to the modern white palette to match the Reports flow.
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Receipt } from '../types';
import { ReceiptThumb } from './ReceiptThumb';
import { StatusChip } from './StatusChip';
import { Icon } from './Icon';
import { fmtDate, fmtMoney } from '../lib/format';
import { colors } from '../theme';
import { useReceiptPhoto } from '../hooks/useReceiptPhoto';

interface Props {
  receipt: Receipt;
  onPress: () => void;
  embedded?: boolean;
  isLast?: boolean;
  highlight?: boolean;
}

export function ReceiptRow({ receipt, onPress, embedded = false, isLast = false, highlight = false }: Props) {
  const { uri } = useReceiptPhoto(receipt);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        embedded ? styles.embedded : styles.standalone,
        highlight && styles.highlight,
        embedded && !isLast && styles.divider,
        pressed && { opacity: 0.6 },
      ]}
    >
      <ReceiptThumb tone={receipt.thumbTone} size={36} photoUri={uri} />
      <View style={styles.middle}>
        <View style={styles.vendorRow}>
          {receipt.source === 'email' && (
            <Icon name="mail" size={12} color={colors.modern.inkTertiary} />
          )}
          <Text style={styles.vendor} numberOfLines={1}>
            {receipt.vendor}
          </Text>
          {receipt.billableTo === 'kai' && (
            <View style={styles.kaiTag}>
              <Text style={styles.kaiTagText}>KAI</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{fmtDate(receipt.date)}</Text>
          <View style={styles.dot} />
          <Text style={styles.meta} numberOfLines={1}>
            {receipt.category}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.total}>{fmtMoney(receipt.total, receipt.currency)}</Text>
        <StatusChip status={receipt.status} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  standalone: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.modern.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: colors.modern.border,
  },
  embedded: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.modern.border,
  },
  highlight: {
    backgroundColor: colors.modern.amberSoft,
    borderColor: 'rgba(217,119,6,0.2)',
  },
  middle: { flex: 1, minWidth: 0 },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  vendor: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.modern.ink,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  kaiTag: {
    backgroundColor: colors.modern.brand,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  kaiTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, color: colors.modern.inkTertiary, flexShrink: 1 },
  dot: { width: 2, height: 2, borderRadius: 99, backgroundColor: colors.modern.inkQuaternary },
  right: { alignItems: 'flex-end', gap: 4 },
  total: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.modern.ink,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
