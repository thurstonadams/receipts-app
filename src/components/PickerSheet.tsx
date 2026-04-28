// Reusable bottom-sheet picker for enum-ish fields (category, payment, project).
import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { Icon } from './Icon';
import { colors } from '../theme';

export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  /**
   * Optional action button rendered below the list — useful for "+ New …"
   * affordances that let the user create an option on the fly. Pressing it
   * does NOT auto-close the sheet; the caller decides what to do next.
   */
  footerAction?: { label: string; onPress: () => void };
}

export function PickerSheet({ visible, title, options, selected, onSelect, onClose, footerAction }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Icon name="xMark" size={14} color="rgba(60,60,67,0.6)" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 440 }}>
            <View style={styles.list}>
              {options.map((o, i) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    i < options.length - 1 && styles.divider,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{o.label}</Text>
                    {o.sub && <Text style={styles.sub}>{o.sub}</Text>}
                  </View>
                  {selected === o.value && <Icon name="check" size={18} color={colors.accent} />}
                </Pressable>
              ))}
            </View>
            {footerAction && (
              <Pressable
                onPress={footerAction.onPress}
                style={({ pressed }) => [styles.footerAction, pressed && { opacity: 0.6 }]}
              >
                <Icon name="plus" size={16} color={colors.accent} />
                <Text style={styles.footerText}>{footerAction.label}</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  handleRow: { alignItems: 'center', paddingVertical: 8, paddingBottom: 4 },
  handle: { width: 36, height: 5, borderRadius: 99, backgroundColor: 'rgba(60,60,67,0.3)' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 6,
  },
  title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 99,
    backgroundColor: 'rgba(60,60,67,0.08)', alignItems: 'center', justifyContent: 'center',
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
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  divider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(60,60,67,0.08)' },
  label: { fontSize: 15, color: '#000' },
  sub: { fontSize: 12, color: 'rgba(60,60,67,0.6)', marginTop: 2 },
  footerAction: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  footerText: { fontSize: 15, color: colors.accent, fontWeight: '600' },
});
