// Tinted placeholder for a receipt that has no photo yet (or as a small thumbnail).
// Uses HSL so the `thumbTone` hue controls the overall tint consistently.
import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

interface Props {
  tone?: number;
  size?: number;
  photoUri?: string;
}

export function ReceiptThumb({ tone = 210, size = 44, photoUri }: Props) {
  const height = Math.round(size * 1.2);
  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={{ width: size, height, borderRadius: 6, backgroundColor: '#eee' }}
      />
    );
  }
  const bg = `hsl(${tone}, 20%, 94%)`;
  const stripe = `hsl(${tone}, 22%, 86%)`;
  const dark = `hsl(${tone}, 25%, 76%)`;
  return (
    <View
      style={[
        styles.thumb,
        { width: size, height, backgroundColor: bg },
      ]}
    >
      <View style={[styles.topBar, { backgroundColor: dark }]} />
      {/* subtle horizontal stripes */}
      <View style={[styles.line, { top: height * 0.35, backgroundColor: stripe }]} />
      <View style={[styles.line, { top: height * 0.48, backgroundColor: stripe }]} />
      <View style={[styles.line, { top: height * 0.61, backgroundColor: stripe }]} />
      <View style={[styles.line, { top: height * 0.74, backgroundColor: stripe }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  topBar: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    height: 5,
    borderRadius: 1,
  },
  line: {
    position: 'absolute',
    left: 5,
    right: 5,
    height: 1.5,
    borderRadius: 1,
    opacity: 0.85,
  },
});
