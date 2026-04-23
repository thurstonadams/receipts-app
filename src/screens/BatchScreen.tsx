import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ScrollView, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { persistCapturedPhoto } from '../lib/photos';
import { uid, todayISO } from '../lib/format';
import { colors } from '../theme';

interface Shot {
  id: string;
  uri: string;
  tone: number;
}

export function BatchScreen() {
  const { navigate, addReceipt, currentEntity } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [shots, setShots] = useState<Shot[]>([]);
  const [flashOn, setFlashOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shotFlash, setShotFlash] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const handleShutter = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setShotFlash(true);
    setTimeout(() => setShotFlash(false), 140);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (photo?.uri) {
        const id = uid();
        const uri = await persistCapturedPhoto(photo.uri, id);
        const tone = Math.floor(Math.random() * 360);
        addReceipt({
          entityId: currentEntity.id,
          vendor: '',
          date: todayISO(),
          total: 0,
          currency: 'USD',
          payment: '',
          category: 'Other',
          notes: '',
          status: 'needs-review',
          thumbTone: tone,
          photoUri: uri,
        });
        setShots(s => [...s, { id, uri, tone }]);
      }
    } catch (err) {
      console.warn('Batch capture failed', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDone = () => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    navigate('home');
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <View style={styles.permIcon}>
          <Icon name="layers" size={28} color="#fff" />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>Batch capture multiple receipts in one session.</Text>
        <Pressable style={styles.permBtn} onPress={() => requestPermission()}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => navigate('home')} style={{ marginTop: 18 }}>
          <Text style={styles.permCancel}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={flashOn} />

      {/* Corner frame (yellow for batch) */}
      <View pointerEvents="none" style={styles.frame}>
        {(['tl', 'tr', 'bl', 'br'] as const).map(pos => (
          <View key={pos} style={[styles.corner, cornerStyles[pos]]} />
        ))}
      </View>

      {shotFlash && <View style={styles.flashOverlay} pointerEvents="none" />}

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.topBar}>
          <Pressable style={styles.topBtn} onPress={() => navigate('home')}>
            <Icon name="xMark" size={18} color="#fff" />
          </Pressable>
          <View style={styles.modePill}>
            <View style={[styles.batchDot, { backgroundColor: colors.yellow }]} />
            <Text style={styles.modePillOn}>Batch · {shots.length} captured</Text>
          </View>
          <Pressable style={[styles.topBtn, flashOn && styles.topBtnOn]} onPress={() => setFlashOn(v => !v)}>
            <Icon name="flash" size={16} color={flashOn ? colors.yellow : '#fff'} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Captured strip */}
      <View pointerEvents="box-none" style={styles.stripWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripInner}>
          {shots.map((s, i) => (
            <View key={s.id} style={styles.stripItem}>
              <Image source={{ uri: s.uri }} style={styles.stripImg} />
              <View style={styles.stripBadge}>
                <Text style={styles.stripBadgeText}>{i + 1}</Text>
              </View>
            </View>
          ))}
          <View style={styles.stripAdd}>
            <Icon name="plus" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        </ScrollView>
      </View>

      {/* Bottom controls */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        <View style={styles.controls}>
          <Pressable onPress={() => navigate('home')} style={{ padding: 14 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleShutter}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <View style={[styles.shutterInner, { backgroundColor: colors.yellow }]} />
          </Pressable>
          <Pressable
            onPress={handleDone}
            disabled={shots.length === 0}
            style={({ pressed }) => [
              styles.doneBtn,
              shots.length === 0 && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.doneText}>Done ({shots.length})</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const cornerStyles = {
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permWrap: {
    flex: 1,
    backgroundColor: '#0A0A0B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permIcon: {
    width: 64, height: 64, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  permTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 10 },
  permSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 28 },
  permBtn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permCancel: { color: 'rgba(255,255,255,0.6)' },
  frame: {
    position: 'absolute',
    top: '22%',
    bottom: '32%',
    left: '15%',
    right: '15%',
  },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: colors.yellow },
  flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', opacity: 0.5 },
  topSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  topBtn: {
    width: 36, height: 36, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  topBtnOn: { backgroundColor: 'rgba(245,194,78,0.25)' },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  batchDot: { width: 6, height: 6, borderRadius: 99 },
  modePillOn: { color: '#fff', fontSize: 13, fontWeight: '600' },
  stripWrap: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
  },
  stripInner: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  stripItem: {
    width: 52, height: 68, borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#222',
  },
  stripImg: { width: '100%', height: '100%' },
  stripBadge: {
    position: 'absolute', top: 3, left: 3,
    width: 16, height: 16, borderRadius: 99,
    backgroundColor: colors.yellow,
    alignItems: 'center', justifyContent: 'center',
  },
  stripBadgeText: { fontSize: 10, fontWeight: '700', color: '#000' },
  stripAdd: {
    width: 52, height: 68, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomSafe: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 16 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cancelText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  shutter: {
    width: 72, height: 72, borderRadius: 99,
    borderWidth: 3.5, borderColor: '#fff', padding: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { flex: 1, width: '100%', borderRadius: 99 },
  doneBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 99,
  },
  doneText: { color: '#000', fontSize: 15, fontWeight: '600' },
});
