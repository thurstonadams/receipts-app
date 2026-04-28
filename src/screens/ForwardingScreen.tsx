// Forwarding addresses screen.
//
// Displays the three Postmark inbound addresses (one per book) that a user
// can forward / send receipts to. Tapping the row opens a Mail composer
// pre-addressed via mailto:; the share button hands the raw string to the
// system share sheet (which exposes a "Copy" action on iOS).
//
// We deliberately surface the raw Postmark sub-addresses rather than the
// branded receipts@xfix.tech aliases — Hostinger SMTP rejects intra-domain
// mail to non-mailbox addresses, so the @xfix.tech variant fails on outbound
// from native iOS Mail. Postmark accepts everything.
import React from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Linking, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme';

const POSTMARK_BASE = '691b1a7702f07b905ac1f9bda93b92a9@inbound.postmarkapp.com';

// Local plus-tag → entity mapping. The inbound Edge Function uses the same
// dictionary, so changes here must be mirrored server-side.
const ROUTES: Array<{
  entityId: 'xfix' | 'kai' | 'personal';
  title: string;
  subtitle: string;
  address: string;
  swatch: string;
}> = [
  {
    entityId: 'xfix',
    title: 'xFix Technologies',
    subtitle: 'Work · xfix.tech',
    address: '691b1a7702f07b905ac1f9bda93b92a9+xfix@inbound.postmarkapp.com',
    swatch: '#26486E',
  },
  {
    entityId: 'kai',
    title: 'KAI LLC',
    subtitle: 'Work · xmotionaxles.com',
    address: '691b1a7702f07b905ac1f9bda93b92a9+kai@inbound.postmarkapp.com',
    swatch: '#2E5F5A',
  },
  {
    entityId: 'personal',
    title: 'Personal',
    subtitle: 'Personal receipts',
    address: '691b1a7702f07b905ac1f9bda93b92a9+personal@inbound.postmarkapp.com',
    swatch: '#C25B3A',
  },
];

export function ForwardingScreen() {
  const { navigate } = useStore();

  const compose = (address: string, label: string) => {
    const url = `mailto:${address}`;
    Linking.canOpenURL(url).then(ok => {
      if (ok) Linking.openURL(url);
      else Alert.alert('Mail unavailable', `Send to:\n${address}`);
    }).catch(() => {
      Alert.alert(label, address);
    });
  };

  const shareAddress = async (address: string, label: string) => {
    try {
      await Share.share({ message: address, title: label });
    } catch {
      Alert.alert(label, address);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => navigate('home')}>
          <Icon name="chevronLeft" size={20} color={colors.accent} />
          <Text style={styles.navBack}>Home</Text>
        </Pressable>
        <Text style={styles.navTitle}>Forwarding</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>EMAIL → RECEIPT</Text>
          <Text style={styles.heroTitle}>Forward receipts straight into a book</Text>
          <Text style={styles.heroBody}>
            Send (or forward) any receipt email to one of the addresses below. It
            lands in that book within ~10 seconds, marked <Text style={styles.heroEmph}>Needs review</Text>{' '}
            with the original attached.
          </Text>
          <Text style={styles.heroBodySecondary}>
            Tip: long-press an address to share it to Contacts so you can pick it
            from your iPhone's autocomplete every time.
          </Text>
        </View>

        {ROUTES.map(route => (
          <View key={route.entityId} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.swatch, { backgroundColor: route.swatch }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{route.title}</Text>
                <Text style={styles.cardSubtitle}>{route.subtitle}</Text>
              </View>
            </View>

            <Pressable
              onPress={() => compose(route.address, route.title)}
              onLongPress={() => shareAddress(route.address, route.title)}
              style={({ pressed }) => [styles.addressRow, pressed && styles.addressRowPressed]}
            >
              <Text style={styles.address} numberOfLines={2} selectable>
                {route.address}
              </Text>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.actionPressed]}
                onPress={() => compose(route.address, route.title)}
              >
                <Icon name="mail" size={14} color="#fff" />
                <Text style={styles.actionPrimaryText}>New email</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.action, styles.actionSecondary, pressed && styles.actionPressed]}
                onPress={() => shareAddress(route.address, route.title)}
              >
                <Icon name="send" size={14} color={colors.accent} />
                <Text style={styles.actionSecondaryText}>Share / Copy</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Which address do I use?</Text>
          <Text style={styles.helpBody}>
            Pick the book the expense belongs to. The plus-tag in the address
            (<Text style={styles.code}>+xfix</Text>, <Text style={styles.code}>+kai</Text>,{' '}
            <Text style={styles.code}>+personal</Text>) tells the system which book
            to file it under. Everything before the <Text style={styles.code}>+</Text>{' '}
            stays the same.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
    width: 80,
  },
  navBack: { fontSize: 17, color: colors.accent },
  navTitle: { fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 60, gap: 14 },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: radius.card,
    padding: 18,
    borderWidth: 0.5,
    borderColor: colors.separator,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    marginBottom: 8,
  },
  heroBodySecondary: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  heroEmph: { fontWeight: '600', color: colors.warningText },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.card,
    padding: 16,
    borderWidth: 0.5,
    borderColor: colors.separator,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },

  addressRow: {
    backgroundColor: 'rgba(60,60,67,0.05)',
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  addressRowPressed: { opacity: 0.6 },
  address: {
    fontFamily: fonts.sfMono,
    fontSize: 12.5,
    color: colors.text,
    letterSpacing: -0.1,
  },

  actionRow: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.control,
  },
  actionPrimary: { backgroundColor: colors.accent },
  actionSecondary: {
    backgroundColor: 'rgba(38,72,110,0.08)',
  },
  actionPressed: { opacity: 0.7 },
  actionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionSecondaryText: { color: colors.accent, fontSize: 14, fontWeight: '600' },

  helpCard: {
    backgroundColor: 'rgba(38,72,110,0.04)',
    borderRadius: radius.cardSm,
    padding: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(38,72,110,0.15)',
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  helpBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  code: {
    fontFamily: fonts.sfMono,
    fontSize: 12,
    color: colors.text,
  },
});
