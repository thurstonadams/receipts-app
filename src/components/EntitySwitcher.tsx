import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { Entity } from '../types';
import { EntityBadge } from './EntityBadge';
import { Icon } from './Icon';
import { colors, fonts } from '../theme';

interface Props {
  visible: boolean;
  entities: Entity[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function EntitySwitcher({ visible, entities, currentId, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Switch book</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="xMark" size={14} color="rgba(60,60,67,0.6)" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Receipts captured while this book is active are filed here. You can reassign anytime.
          </Text>

          <ScrollView style={{ maxHeight: 420 }}>
            <View style={styles.list}>
              {entities.map((e, i) => (
                <Pressable
                  key={e.id}
                  onPress={() => onSelect(e.id)}
                  style={({ pressed }) => [
                    styles.row,
                    i < entities.length - 1 && styles.rowDivider,
                    currentId === e.id && styles.rowActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <EntityBadge entity={e} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{e.name}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>{e.type}</Text>
                      {e.ein && (
                        <>
                          <View style={styles.metaDot} />
                          <Text style={[styles.meta, { fontFamily: fonts.sfMono }]}>EIN {e.ein}</Text>
                        </>
                      )}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={[styles.platformDot, { backgroundColor: e.platformColor }]} />
                      <Text style={styles.platform}>{e.platform}</Text>
                    </View>
                  </View>
                  {currentId === e.id && (
                    <View style={styles.check}>
                      <Icon name="check" size={14} color="#fff" />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 34,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingBottom: 10,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(60,60,67,0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 99,
    backgroundColor: 'rgba(60,60,67,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(60,60,67,0.6)',
    paddingHorizontal: 22,
    paddingBottom: 14,
    lineHeight: 17,
  },
  list: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(60,60,67,0.08)' },
  rowActive: { backgroundColor: 'rgba(38,72,110,0.04)' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#000', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 },
  meta: { fontSize: 12, color: 'rgba(60,60,67,0.6)' },
  metaDot: { width: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(60,60,67,0.3)' },
  platformDot: { width: 6, height: 6, borderRadius: 99 },
  platform: { fontSize: 11, color: 'rgba(60,60,67,0.65)', fontWeight: '500' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 99,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
