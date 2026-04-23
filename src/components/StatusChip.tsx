import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ReceiptStatus } from '../types';
import { statusMeta } from '../theme';

export function StatusChip({ status }: { status: ReceiptStatus }) {
  const m = statusMeta[status] ?? statusMeta.ready;
  return (
    <View style={[styles.chip, { backgroundColor: m.bg }]}>
      <View style={[styles.dot, { backgroundColor: m.dot }]} />
      <Text style={[styles.label, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 7,
    paddingRight: 8,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    marginRight: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
