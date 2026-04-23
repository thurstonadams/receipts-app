import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { PickerSheet, PickerOption } from '../components/PickerSheet';
import { CATEGORIES, PAYMENT_METHODS, PROJECTS } from '../data/categories';
import { fmtDateFull } from '../lib/format';
import { colors, fonts } from '../theme';
import { Receipt } from '../types';

export function ReviewScreen() {
  const { currentReceipt, updateReceipt, deleteReceipt, navigate, currentEntity } = useStore();

  // Local draft — lets the user cancel.
  const initial: Receipt | null = currentReceipt;
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [totalText, setTotalText] = useState(initial ? initial.total.toFixed(2) : '0.00');
  const [date, setDate] = useState(initial?.date ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Other');
  const [project, setProject] = useState(initial?.project ?? '');
  const [payment, setPayment] = useState(initial?.payment ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [pickerOpen, setPickerOpen] = useState<'category' | 'payment' | 'project' | null>(null);

  const categoryOptions: PickerOption[] = useMemo(
    () => CATEGORIES.map(c => ({ value: c.name, label: c.name, sub: c.code })),
    []
  );
  const paymentOptions: PickerOption[] = useMemo(
    () => [...PAYMENT_METHODS.map(p => ({ value: p.label, label: p.label })), { value: 'Other', label: 'Other / cash' }],
    []
  );
  const projectOptions: PickerOption[] = useMemo(
    () => [{ value: '', label: '— None —' }, ...PROJECTS.map(p => ({ value: p.name, label: p.name }))],
    []
  );

  if (!initial) {
    return (
      <SafeAreaView style={styles.rootEmpty}>
        <Text style={styles.empty}>No receipt selected.</Text>
        <Pressable onPress={() => navigate('home')} style={styles.emptyBtn}>
          <Text style={styles.emptyBtnText}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    const parsed = parseFloat(totalText.replace(/[^0-9.]/g, ''));
    const cat = CATEGORIES.find(c => c.name === category);
    const hasRequired = vendor.trim() && !isNaN(parsed) && parsed > 0;
    updateReceipt({
      ...initial,
      vendor: vendor.trim(),
      total: isNaN(parsed) ? 0 : parsed,
      date: date || initial.date,
      category,
      categoryCode: cat?.code,
      project: project || undefined,
      payment,
      notes,
      status: hasRequired ? 'ready' : 'needs-review',
    });
    navigate('home');
  };

  const handleDelete = () => {
    Alert.alert('Delete receipt?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReceipt(initial.id);
          navigate('home');
        },
      },
    ]);
  };

  const isBusiness = currentEntity.id !== 'personal';

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
            <Icon name="chevronLeft" size={20} color={colors.accent} />
            <Text style={styles.navBack}>Receipts</Text>
          </Pressable>
          <Text style={styles.navTitle}>Review</Text>
          <Pressable style={styles.navBtn} onPress={handleSave}>
            <Text style={styles.navSave}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {/* Photo preview */}
          {initial.photoUri ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: initial.photoUri }} style={styles.photo} resizeMode="contain" />
            </View>
          ) : (
            <View style={styles.photoWrap}>
              <View style={styles.noPhoto}>
                <Icon name="receipt" size={36} color="rgba(60,60,67,0.4)" />
                <Text style={styles.noPhotoText}>No photo — entering manually</Text>
              </View>
            </View>
          )}

          {/* Total hero */}
          <View style={styles.sectionPad}>
            <View style={styles.totalCard}>
              <Text style={styles.label}>TOTAL</Text>
              <View style={styles.totalRow}>
                <Text style={[styles.totalSign, { fontFamily: fonts.sfMono }]}>$</Text>
                <TextInput
                  value={totalText}
                  onChangeText={setTotalText}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[styles.totalInput, { fontFamily: fonts.sfMono }]}
                  placeholder="0.00"
                  placeholderTextColor="rgba(60,60,67,0.3)"
                />
                <Text style={styles.totalCur}>USD</Text>
              </View>
            </View>
          </View>

          {/* Vendor, Date */}
          <FieldGroup>
            <TextField label="Vendor" value={vendor} onChangeText={setVendor} placeholder="e.g. Shell Gas Station" />
            <TextField
              label="Date"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              last
            />
          </FieldGroup>

          {/* Bookkeeping */}
          <FieldGroup header="Bookkeeping">
            <PickerField
              label="Category"
              value={category || 'Select category'}
              sub={CATEGORIES.find(c => c.name === category)?.code}
              onPress={() => setPickerOpen('category')}
            />
            {isBusiness && (
              <PickerField
                label="Project / Client"
                value={project || 'None'}
                onPress={() => setPickerOpen('project')}
              />
            )}
            <PickerField
              label="Payment"
              value={payment || 'Select payment method'}
              onPress={() => setPickerOpen('payment')}
              last
            />
          </FieldGroup>

          {/* Notes */}
          <FieldGroup header="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note for your records…"
              placeholderTextColor="rgba(60,60,67,0.35)"
              multiline
              style={styles.notesInput}
            />
          </FieldGroup>

          {/* Delete */}
          <View style={[styles.sectionPad, { paddingTop: 20 }]}>
            <Pressable onPress={handleDelete} style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.deleteText}>Delete receipt</Text>
            </Pressable>
          </View>

          {initial.date && (
            <Text style={styles.fullDate}>{fmtDateFull(initial.date)}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={pickerOpen === 'category'}
        title="Category"
        options={categoryOptions}
        selected={category}
        onSelect={setCategory}
        onClose={() => setPickerOpen(null)}
      />
      <PickerSheet
        visible={pickerOpen === 'payment'}
        title="Payment"
        options={paymentOptions}
        selected={payment}
        onSelect={setPayment}
        onClose={() => setPickerOpen(null)}
      />
      <PickerSheet
        visible={pickerOpen === 'project'}
        title="Project / Client"
        options={projectOptions}
        selected={project}
        onSelect={setProject}
        onClose={() => setPickerOpen(null)}
      />
    </SafeAreaView>
  );
}

// ── Field building blocks ──────────────────────────────────
function FieldGroup({ header, children }: { header?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      {header && (
        <Text style={styles.groupHeader}>{header.toUpperCase()}</Text>
      )}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function TextField({
  label, value, onChangeText, placeholder, last,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(60,60,67,0.35)"
        style={styles.fieldInput}
      />
    </View>
  );
}

function PickerField({
  label, value, sub, onPress, last,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fieldRow, !last && styles.fieldDivider, pressed && { opacity: 0.6 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerRight}>
        <Text style={styles.pickerValue} numberOfLines={1}>{value}</Text>
        {sub && <Text style={styles.pickerSub}>{sub}</Text>}
        <Icon name="chevron" size={14} color="rgba(60,60,67,0.3)" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootEmpty: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 15, color: 'rgba(60,60,67,0.6)', marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(60,60,67,0.08)',
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, minWidth: 80 },
  navBack: { color: colors.accent, fontSize: 17, marginLeft: 2 },
  navSave: { color: colors.accent, fontSize: 17, fontWeight: '600', width: '100%', textAlign: 'right' },
  navTitle: { fontSize: 17, fontWeight: '600' },
  photoWrap: { alignItems: 'center', paddingTop: 14 },
  photo: { width: 200, height: 260, borderRadius: 8, backgroundColor: '#eee' },
  noPhoto: {
    width: 200, height: 180, borderRadius: 8, backgroundColor: '#fff',
    borderWidth: 0.5, borderColor: 'rgba(60,60,67,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  noPhotoText: { marginTop: 8, fontSize: 12, color: 'rgba(60,60,67,0.55)' },
  sectionPad: { paddingHorizontal: 16, paddingTop: 14 },
  totalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  label: { fontSize: 11, fontWeight: '600', color: 'rgba(60,60,67,0.55)', letterSpacing: 0.4, marginBottom: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline' },
  totalSign: { fontSize: 22, fontWeight: '600', color: '#000', marginRight: 2 },
  totalInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -1,
    padding: 0,
  },
  totalCur: { fontSize: 14, color: 'rgba(60,60,67,0.5)', fontWeight: '500', marginLeft: 6 },
  groupHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(60,60,67,0.55)',
    letterSpacing: 0.4,
    paddingHorizontal: 32,
    paddingVertical: 6,
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  fieldRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 52,
  },
  fieldDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(60,60,67,0.08)' },
  fieldLabel: { fontSize: 11, color: 'rgba(60,60,67,0.55)', fontWeight: '500', marginBottom: 3 },
  fieldInput: { fontSize: 16, color: '#000', padding: 0 },
  pickerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickerValue: { fontSize: 16, color: '#000', flex: 1 },
  pickerSub: { fontSize: 11, color: 'rgba(60,60,67,0.5)', fontFamily: fonts.sfMono },
  notesInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000',
    minHeight: 80,
  },
  deleteBtn: {
    backgroundColor: 'rgba(194,91,58,0.08)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.warning },
  fullDate: {
    fontSize: 12,
    color: 'rgba(60,60,67,0.5)',
    textAlign: 'center',
    marginTop: 10,
  },
});
