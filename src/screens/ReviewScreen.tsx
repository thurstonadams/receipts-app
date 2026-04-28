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
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { PickerSheet, PickerOption } from '../components/PickerSheet';
import { CATEGORIES, PAYMENT_METHODS } from '../data/categories';
import { useProjects } from '../lib/projects';
import { fmtDateFull } from '../lib/format';
import { supabase } from '../lib/supabase';
import { colors, fonts, statusMeta } from '../theme';
import { Receipt } from '../types';
import { useReceiptPhoto } from '../hooks/useReceiptPhoto';

function parseISODate(iso: string): Date {
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ReviewScreen() {
  const { currentReceipt, updateReceipt, deleteReceipt, navigate, currentEntity, userId } = useStore();
  const insets = useSafeAreaInsets();
  // Per-user, per-entity custom project list. Free-text — user types their
  // own and we persist the merged set in AsyncStorage.
  const { projects: savedProjects, add: addProjectName } = useProjects(userId, currentEntity.id);

  const initial: Receipt | null = currentReceipt;
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [totalText, setTotalText] = useState(initial ? initial.total.toFixed(2) : '0.00');
  const [date, setDate] = useState(initial?.date ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Other');
  const [project, setProject] = useState(initial?.project ?? '');
  const [payment, setPayment] = useState(initial?.payment ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [pickerOpen, setPickerOpen] = useState<'category' | 'payment' | 'project' | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(() => parseISODate(initial?.date ?? ''));

  const photo = useReceiptPhoto(initial);

  const categoryOptions: PickerOption[] = useMemo(
    () => CATEGORIES.map(c => ({ value: c.name, label: c.name, sub: c.code })),
    []
  );
  const paymentOptions: PickerOption[] = useMemo(
    () => PAYMENT_METHODS.map(p => ({ value: p.label, label: p.label })),
    []
  );
  // Build the project picker list. Always lead with "— None —", then the
  // user's saved projects for this entity. If the receipt already has a
  // project value that isn't in the saved list (e.g. legacy data, or one
  // that hasn't been saved yet this session), surface it too so the user
  // can keep it selected.
  const projectOptions: PickerOption[] = useMemo(() => {
    const opts: PickerOption[] = [{ value: '', label: '— None —' }];
    const seen = new Set<string>();
    const add = (name: string) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      opts.push({ value: name, label: name });
    };
    savedProjects.forEach(add);
    if (project) add(project);
    return opts;
  }, [savedProjects, project]);

  // Prompt the user for a new project name, save it, select it.
  // Alert.prompt is iOS-only; on Android we'd need an inline modal but the
  // app ships iOS-only via TestFlight so this is sufficient.
  const handleAddProject = () => {
    setPickerOpen(null);
    if (Platform.OS !== 'ios') return;
    Alert.prompt(
      'New project',
      'Type a project or client name to save it for this book.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (text?: string) => {
            const name = (text ?? '').trim();
            if (!name) return;
            const saved = await addProjectName(name);
            if (saved) setProject(saved);
          },
        },
      ],
      'plain-text',
    );
  };

  if (!initial) {
    return (
      <SafeAreaView style={styles.rootEmpty}>
        <Text style={styles.emptyText}>No receipt selected.</Text>
        <Pressable onPress={() => navigate('home')} style={styles.emptyBtn}>
          <Text style={styles.emptyBtnText}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    const trimmedDate = (date || initial.date).trim();
    const dateOk =
      /^\d{4}-\d{2}-\d{2}$/.test(trimmedDate) &&
      !Number.isNaN(new Date(trimmedDate + 'T00:00:00').getTime());
    if (!dateOk) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format (e.g. 2026-04-24).');
      return;
    }
    const parsed = parseFloat(totalText.replace(/[^0-9.]/g, ''));
    const cat = CATEGORIES.find(c => c.name === category);
    const hasRequired = vendor.trim() && !isNaN(parsed) && parsed > 0;
    updateReceipt({
      ...initial,
      vendor: vendor.trim(),
      total: isNaN(parsed) ? 0 : parsed,
      date: trimmedDate,
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

  // Open the original PDF/EML/HTML attachment via a short-lived signed URL,
  // handed off to the OS so it shows in Safari / Files / Mail.
  const handleViewOriginal = async () => {
    if (!initial.attachmentPath) return;
    const { data, error } = await supabase
      .storage
      .from('receipt-attachments')
      .createSignedUrl(initial.attachmentPath, 60 * 5);
    if (error || !data?.signedUrl) {
      Alert.alert("Couldn't open original", error?.message ?? 'No URL returned.');
      return;
    }
    Linking.openURL(data.signedUrl).catch(err => {
      Alert.alert("Couldn't open original", String(err));
    });
  };

  const isBusiness = currentEntity.id !== 'personal';
  const statusInfo = statusMeta[initial.status] ?? statusMeta['needs-review'];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Nav */}
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
            <Icon name="chevronLeft" size={22} color={colors.accent} />
            <Text style={styles.navBack}>Back</Text>
          </Pressable>
          <Text style={styles.navTitle}>Edit Receipt</Text>
          <View style={{ minWidth: 72 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <View style={styles.photoCard}>
            {photo.uri ? (
              <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
            ) : photo.loading ? (
              <View style={styles.photoPlaceholder}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.photoPlaceholderText}>Loading photo…</Text>
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Icon name={initial.source === 'email' ? 'mail' : 'receipt'} size={40} color="rgba(60,60,67,0.2)" />
                <Text style={styles.photoPlaceholderText}>
                  {initial.source === 'email'
                    ? 'Forwarded email'
                    : initial.photoPath
                      ? 'Photo unavailable on this device'
                      : 'No photo attached'}
                </Text>
              </View>
            )}
          </View>

          {/* Source-of-truth banner for email-sourced receipts */}
          {initial.source === 'email' && (
            <View style={styles.emailBanner}>
              <View style={styles.emailBannerHead}>
                <Icon name="mail" size={14} color={colors.accent} />
                <Text style={styles.emailBannerLabel}>FORWARDED EMAIL</Text>
              </View>
              {initial.sourceEmail && (
                <Text style={styles.emailBannerLine} numberOfLines={1}>
                  From <Text style={styles.emailBannerStrong}>{initial.sourceEmail}</Text>
                </Text>
              )}
              {initial.sourceSubject && (
                <Text style={styles.emailBannerLine} numberOfLines={2}>
                  {initial.sourceSubject}
                </Text>
              )}
              {initial.attachmentPath && (
                <Pressable
                  onPress={handleViewOriginal}
                  style={({ pressed }) => [styles.viewOriginalBtn, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="document" size={14} color={colors.accent} />
                  <Text style={styles.viewOriginalText}>View original</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Hero card — status + total */}
          <View style={styles.heroCard}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: '#fff' }]} />
              <Text style={styles.statusLabel}>{statusInfo.label}</Text>
            </View>
            <Text style={styles.amountHint}>TOTAL AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amountCurrency, { fontFamily: fonts.sfMono }]}>$</Text>
              <TextInput
                value={totalText}
                onChangeText={setTotalText}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={[styles.amountInput, { fontFamily: fonts.sfMono }]}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
              <Text style={styles.amountCode}>USD</Text>
            </View>
          </View>

          {/* Details */}
          <SectionHeader title="Details" />
          <View style={styles.group}>
            <HRow label="Vendor" last={false}>
              <TextInput
                value={vendor}
                onChangeText={setVendor}
                placeholder="Vendor name"
                placeholderTextColor={colors.textTertiary}
                style={styles.rowInput}
                textAlign="right"
                returnKeyType="done"
              />
            </HRow>
            <PickerRow
              label="Date"
              value={date ? fmtDateFull(date) : 'Select date'}
              onPress={() => { setPendingDate(parseISODate(date)); setDatePickerOpen(true); }}
              last
            />
          </View>

          {/* Bookkeeping */}
          <SectionHeader title="Bookkeeping" />
          <View style={styles.group}>
            <PickerRow
              label="Category"
              value={category || 'Select category'}
              sub={CATEGORIES.find(c => c.name === category)?.code}
              onPress={() => setPickerOpen('category')}
            />
            {isBusiness && (
              <PickerRow
                label="Project"
                value={project || 'None'}
                onPress={() => setPickerOpen('project')}
              />
            )}
            <PickerRow
              label="Payment"
              value={payment || 'Select method'}
              onPress={() => setPickerOpen('payment')}
              last
            />
          </View>

          {/* Notes */}
          <SectionHeader title="Notes" />
          <View style={styles.group}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note for your records…"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={styles.notesInput}
            />
          </View>

          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.55 }]}
          >
            <Text style={styles.deleteText}>Delete Receipt</Text>
          </Pressable>
        </ScrollView>

        {/* Sticky save bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.88 }]}
          >
            <Icon name="check" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Save Receipt</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <Modal visible={datePickerOpen} transparent animationType="slide" onRequestClose={() => setDatePickerOpen(false)}>
        <Pressable style={pickerStyles.backdrop} onPress={() => setDatePickerOpen(false)}>
          <Pressable style={pickerStyles.sheet} onPress={() => {}}>
            <View style={pickerStyles.handleRow}>
              <View style={pickerStyles.handle} />
            </View>
            <View style={pickerStyles.header}>
              <Pressable onPress={() => setDatePickerOpen(false)}>
                <Text style={pickerStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Text style={pickerStyles.title}>Receipt Date</Text>
              <Pressable onPress={() => { setDate(toISODate(pendingDate)); setDatePickerOpen(false); }}>
                <Text style={pickerStyles.doneText}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pendingDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (d) setPendingDate(d);
                if (Platform.OS !== 'ios') { setDatePickerOpen(false); if (d) setDate(toISODate(d)); }
              }}
              style={{ alignSelf: 'stretch' }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <PickerSheet visible={pickerOpen === 'category'} title="Category" options={categoryOptions} selected={category} onSelect={setCategory} onClose={() => setPickerOpen(null)} />
      <PickerSheet visible={pickerOpen === 'payment'} title="Payment Method" options={paymentOptions} selected={payment} onSelect={setPayment} onClose={() => setPickerOpen(null)} />
      <PickerSheet
        visible={pickerOpen === 'project'}
        title="Project / Client"
        options={projectOptions}
        selected={project}
        onSelect={setProject}
        onClose={() => setPickerOpen(null)}
        footerAction={{ label: 'Add new project', onPress: handleAddProject }}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>;
}

function HRow({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.hRow, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>{children}</View>
    </View>
  );
}

function PickerRow({ label, value, sub, onPress, last }: { label: string; value: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.hRow, !last && styles.rowDivider, pressed && { opacity: 0.55 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.pickerRight}>
        {sub && <Text style={styles.pickerSub}>{sub}</Text>}
        <Text style={styles.pickerValue} numberOfLines={1}>{value}</Text>
        <Icon name="chevron" size={15} color="rgba(60,60,67,0.28)" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootEmpty: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingVertical: 10, backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, minWidth: 72 },
  navBack: { color: colors.accent, fontSize: 17, marginLeft: 1 },
  navTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  scroll: { paddingBottom: 20 },
  photoCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 18, overflow: 'hidden',
    backgroundColor: '#fff', height: 220,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  photoPlaceholderText: { fontSize: 13, color: 'rgba(60,60,67,0.4)', textAlign: 'center' },
  heroCard: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: colors.accent,
    borderRadius: 18, padding: 20,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.18)', gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 12, fontWeight: '600', color: '#fff', letterSpacing: 0.2 },
  amountHint: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  amountCurrency: { fontSize: 26, fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginRight: 3 },
  amountInput: { flex: 1, fontSize: 46, fontWeight: '700', color: '#fff', letterSpacing: -2, padding: 0 },
  amountCode: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.55)', marginLeft: 8, marginBottom: 4 },
  sectionHeader: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5,
    paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8,
  },
  group: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  hRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowLabel: { fontSize: 15, color: colors.text, flex: 0.4 },
  rowRight: { flex: 0.6, alignItems: 'flex-end' },
  rowInput: { fontSize: 15, color: colors.text, textAlign: 'right', padding: 0, flex: 1 },
  pickerRight: { flex: 0.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  pickerValue: { fontSize: 15, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  pickerSub: { fontSize: 11, color: 'rgba(60,60,67,0.45)', fontFamily: fonts.sfMono },
  notesInput: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text, minHeight: 90 },
  deleteBtn: { alignSelf: 'center', marginTop: 28, paddingVertical: 8, paddingHorizontal: 16 },
  deleteText: { fontSize: 14, color: colors.warning, fontWeight: '500' },
  bottomBar: {
    backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 8,
  },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  emailBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(38,72,110,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(38,72,110,0.18)',
  },
  emailBannerHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  emailBannerLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.accent,
  },
  emailBannerLine: { fontSize: 13, color: colors.text, marginTop: 2 },
  emailBannerStrong: { fontWeight: '600' },
  viewOriginalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(38,72,110,0.25)',
  },
  viewOriginalText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: {
    width: 36, height: 4, borderRadius: 4,
    backgroundColor: 'rgba(60,60,67,0.2)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  cancelText: { color: 'rgba(60,60,67,0.7)', fontSize: 15 },
  doneText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '600' },
});
