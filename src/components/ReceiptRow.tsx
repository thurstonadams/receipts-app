import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Receipt } from '../types';
import { ReceiptThumb } from './ReceiptThumb';
import { StatusChip } from './StatusChip';
import { fmtDate } from '../lib/format';
import { fonts } from '../theme';
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
        <Text style={styles.vendor} numberOfLines={1}>
          {receipt.vendor}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{fmtDate(receipt.date)}</Text>
          <View style={styles.dot} />
          <Text style={styles.meta} numberOfLines={1}>
            {receipt.category}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.total}>${receipt.total.toFixed(2)}</Text>
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
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  embedded: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(60,60,67,0.08)',
  },
  highlight: {
    backgroundColor: 'rgba(194,91,58,0.04)',
    borderColor: 'rgba(194,91,58,0.2)',
  },
  middle: { flex: 1, minWidth: 0 },
  vendor: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, color: 'rgba(60,60,67,0.6)', flexShrink: 1 },
  dot: { width: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(60,60,67,0.3)' },
  right: { alignItems: 'flex-end', gap: 4 },
  total: {
    fontFamily: fonts.sfMono,
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
});
