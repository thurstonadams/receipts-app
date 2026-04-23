import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { Icon } from '../components/Icon';
import { persistCapturedPhoto } from '../lib/photos';
import { uid, todayISO } from '../lib/format';
import { colors } from '../theme';

export function CaptureScreen() {
  const { navigate, addReceipt, currentEntity } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shotFlash, setShotFlash] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const handleShutter = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setShotFlash(true);
    setTimeout(() => setShotFlash(false), 180);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (photo?.uri) {
        const id = uid();
        const permanentUri = await persistCapturedPhoto(photo.uri, id);
        const receipt = addReceipt({
          entityId: currentEntity.id,
          vendor: '',
          date: todayISO(),
          total: 0,
          currency: 'USD',
          payment: '',
          category: 'Other',
          notes: '',
          status: 'needs-review',
          thumbTone: Math.floor(Math.random() * 360),
          photoUri: permanentUri,
        });
        navigate('review', receipt.id);
      }
    } catch (err) {
      console.warn('Capture failed', err);
    } finally {
      setCapturing(false);
    }
  };

  // Permission states
  if (!permission) {
    return (
      <View style={styles.permissionWrap}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionWrap}>
        <View style={styles.permIcon}>
          <Icon name="camera" size={32} color="#fff" />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>
          xFix Receipts uses your camera to capture receipt photos. Your receipts never leave your device.
        </Text>
        <Pressable style={styles.permBtn} onPress={() => requestPermission()}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => navigate('home')} style={{ marginTop: 18 }}>
          <Text style={styles.permCancel}>Not now</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flashOn}
      />

      {/* Edge overlay framing */}
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
            <Text style={styles.modePillMuted}>Receipt</Text>
            <View style={styles.modePillDot} />
            <Text style={styles.modePillOn}>Auto</Text>
          </View>
          <Pressable style={[styles.topBtn, flashOn && styles.topBtnOn]} onPress={() => setFlashOn(v => !v)}>
            <Icon name="flash" size={16} color={flashOn ? colors.yellow : '#fff'} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom controls */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        <View style={styles.modeRow}>
          <Pressable onPress={() => navigate('home')}>
            <Text style={styles.modeChip}>CANCEL</Text>
          </Pressable>
          <Text style={[styles.modeChip, styles.modeChipActive]}>AUTO</Text>
          <Pressable onPress={() => navigate('batch')}>
            <Text style={styles.modeChip}>BATCH</Text>
          </Pressable>
        </View>

        <View style={styles.shutterRow}>
          <View style={styles.sidePlaceholder} />
          <Pressable
            onPress={handleShutter}
            disabled={capturing}
            style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <View style={styles.shutterInner} />
            {capturing && (
              <View style={StyleSheet.absoluteFillObject}>
                <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
              </View>
            )}
          </Pressable>
          <Pressable style={styles.sideBtn}>
            <Icon name="grid" size={20} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const cornerStyles = {
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permissionWrap: {
    flex: 1,
    backgroundColor: '#0A0A0B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 10 },
  permSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  permBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permCancel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  frame: {
    position: 'absolute',
    top: '25%',
    bottom: '30%',
    left: '12%',
    right: '12%',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#fff',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.7,
  },
  topSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBtnOn: { backgroundColor: 'rgba(245,194,78,0.25)' },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modePillMuted: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  modePillDot: { width: 2, height: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.4)' },
  modePillOn: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bottomSafe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 22,
  },
  modeChip: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.65)',
  },
  modeChipActive: { color: colors.yellow },
  shutterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  sidePlaceholder: { width: 46, height: 46 },
  sideBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 99,
    borderWidth: 3.5,
    borderColor: '#fff',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    flex: 1,
    width: '100%',
    borderRadius: 99,
    backgroundColor: '#fff',
  },
});
