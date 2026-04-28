// Send sheet — pre-flight before mailing the invoice.
//
// Reads the persisted Report + ReportLines for the current period.
// Renders the PDF, uploads it to the reports bucket (best-effort), opens
// the system mail composer with the PDF attached and the email pre-composed.
//
// On a successful send we patch the report row to status='sent'.
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import {
  fetchReports, fetchReportLines, fmtCents, markReportSent,
} from '../lib/reports';
import {
  buildEmailDefaults, composeInvoiceEmail, renderInvoicePdf, uploadInvoicePdf,
} from '../lib/pdfReport';
import { Report, ReportLine } from '../types';
import { colors, type } from '../theme';
import * as MailComposer from 'expo-mail-composer';

const KAI_RECIPIENT = 'thurston.adams@kalyaniaftermarket.com';

export function SendSheetScreen() {
  const { state, navigate, userId } = useStore();
  const insets = useSafeAreaInsets();
  const reportId = state.currentReportId ?? '';

  const [report, setReport] = useState<Report | null>(null);
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const [recipient, setRecipient] = useState(KAI_RECIPIENT);
  const [cc, setCc] = useState('thurston@xfix.tech');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [all, lns] = await Promise.all([
          fetchReports(),
          fetchReportLines(reportId),
        ]);
        if (cancelled) return;
        const rep = all.find(r => r.id === reportId) ?? null;
        setReport(rep);
        setLines(lns);
        if (rep) {
          if (rep.recipientEmail) setRecipient(rep.recipientEmail);
          if (rep.ccEmail) setCc(rep.ccEmail);
          const defs = buildEmailDefaults(rep, lns.length);
          setSubject(defs.subject);
          setBody(defs.body);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  const handlePreview = async () => {
    if (!report) return;
    try {
      const uri = await renderInvoicePdf(report, lines);
      setPreviewUri(uri);
      Alert.alert('PDF ready', `Saved locally as ${report.id}.pdf`);
    } catch (err) {
      Alert.alert("Couldn't render PDF", String((err as Error).message ?? err));
    }
  };

  const handleSend = async () => {
    if (!report) return;
    setSending(true);
    try {
      const uri = previewUri ?? await renderInvoicePdf(report, lines);
      // Best-effort upload — don't block the send if Storage hiccups.
      uploadInvoicePdf(uri, userId, report.id).catch(() => {});
      const result = await composeInvoiceEmail({
        to: recipient,
        cc: cc || undefined,
        subject,
        body,
        attachmentUri: uri,
      });
      if (result.status === MailComposer.MailComposerStatus.SENT) {
        await markReportSent(report.id);
        Alert.alert('Sent', `${report.id} emailed to ${recipient}.`);
        navigate('reports');
      } else if (result.status === MailComposer.MailComposerStatus.SAVED) {
        Alert.alert('Saved as draft', 'Email saved to drafts. Send it from Mail when ready.');
      } else {
        // CANCELLED — just stay on the sheet.
      }
    } catch (err) {
      Alert.alert("Couldn't send", String((err as Error).message ?? err));
    } finally {
      setSending(false);
    }
  };

  const sendDisabled = useMemo(
    () => !report || sending || lines.length === 0 || !recipient.trim(),
    [report, sending, lines, recipient],
  );

  if (!reportId) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No report selected.</Text>
          <Pressable onPress={() => navigate('reports')}>
            <Text style={styles.backLink}>Back to Reports</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('period-detail')}>
          <Icon name="chevronLeft" size={20} color={colors.modern.brand} />
          <Text style={styles.navBack}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Send invoice</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.modern.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.headerBlock}>
            <Text style={type.eyebrow}>Send invoice</Text>
            <Text style={styles.title}>{reportId}</Text>
            <Text style={styles.subtitle}>
              {report ? fmtCents(report.totalCents) : '$0.00'} · {lines.length} {lines.length === 1 ? 'line item' : 'line items'}
            </Text>
          </View>

          <View style={styles.card}>
            <FieldRow label="To">
              <TextInput
                value={recipient}
                onChangeText={setRecipient}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="recipient@example.com"
                placeholderTextColor={colors.modern.inkTertiary}
              />
            </FieldRow>
            <FieldRow label="Cc">
              <TextInput
                value={cc}
                onChangeText={setCc}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="optional"
                placeholderTextColor={colors.modern.inkTertiary}
              />
            </FieldRow>
            <FieldRow label="Subject" last>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                style={styles.input}
                placeholder="KAI invoice — …"
                placeholderTextColor={colors.modern.inkTertiary}
              />
            </FieldRow>
          </View>

          <View style={[styles.card, { padding: 14, marginTop: 12 }]}>
            <Text style={[type.eyebrow, { fontSize: 9 }]}>Attachment</Text>
            <View style={styles.attachmentRow}>
              <View style={styles.pdfThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfName}>{reportId}.pdf</Text>
                <Text style={styles.pdfMeta}>
                  {lines.length} {lines.length === 1 ? 'line item' : 'line items'} · {previewUri ? 'rendered' : 'will render on send'}
                </Text>
              </View>
              <Pressable style={styles.previewBtn} onPress={handlePreview}>
                <Text style={styles.previewBtnText}>Preview</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.card, { padding: 14, marginTop: 12 }]}>
            <Text style={[type.eyebrow, { fontSize: 9 }]}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              style={styles.bodyInput}
              multiline
              placeholder="Email body…"
              placeholderTextColor={colors.modern.inkTertiary}
            />
          </View>

          <Text style={styles.footnote}>
            Sending marks the period as Sent. Receipts stay untouched —
            traceability lives in {reportId}.
          </Text>
        </ScrollView>
      )}

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.btnPrimary,
            sendDisabled && styles.btnPrimaryDisabled,
            pressed && !sendDisabled && { opacity: 0.85 },
          ]}
          onPress={handleSend}
          disabled={sendDisabled}
        >
          <Text style={styles.btnPrimaryText}>{sending ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function FieldRow({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <View style={[fieldStyles.row, !last && fieldStyles.divider]}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 12 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.modern.border },
  label: { width: 60, fontSize: 11, fontWeight: '500', color: colors.modern.inkTertiary, letterSpacing: 0.6, textTransform: 'uppercase' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.modern.pageBg },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.modern.pageBg,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  navBack: { fontSize: 17, color: colors.modern.brand },
  navTitle: { fontSize: 17, fontWeight: '500', color: colors.modern.ink, letterSpacing: -0.3 },

  scroll: { padding: 16, paddingBottom: 100 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerBlock: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 12 },
  title: { ...type.h1, fontSize: 19, marginTop: 4 },
  subtitle: { ...type.bodySmall, marginTop: 2, fontVariant: ['tabular-nums'] },

  card: {
    backgroundColor: colors.modern.surface,
    borderWidth: 0.5, borderColor: colors.modern.border,
    borderRadius: 14,
  },
  input: {
    fontSize: 14, color: colors.modern.ink,
    paddingVertical: 0,
  },
  bodyInput: {
    fontSize: 14, color: colors.modern.ink,
    minHeight: 100, marginTop: 8, lineHeight: 20,
  },

  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  pdfThumb: {
    width: 36, height: 46,
    backgroundColor: '#FAFAFA',
    borderWidth: 0.5, borderColor: colors.modern.border,
    borderRadius: 4,
  },
  pdfName: { fontSize: 13, fontWeight: '500', color: colors.modern.ink, fontVariant: ['tabular-nums'] },
  pdfMeta: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 1 },
  previewBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(9,9,11,0.04)',
  },
  previewBtnText: { fontSize: 12, fontWeight: '500', color: colors.modern.ink },

  footnote: { fontSize: 11, color: colors.modern.inkTertiary, marginTop: 14, textAlign: 'center', lineHeight: 16 },

  actionBar: {
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: colors.modern.surface,
    borderTopWidth: 0.5, borderTopColor: colors.modern.border,
  },
  btnPrimary: {
    backgroundColor: colors.modern.ink,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  btnPrimaryDisabled: { opacity: 0.4 },
  btnPrimaryText: { color: colors.modern.surface, fontSize: 15, fontWeight: '500' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 13, color: colors.modern.inkSecondary },
  backLink: { color: colors.modern.brand, fontSize: 14 },
});
