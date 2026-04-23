// Design tokens — matches the HTML prototype values 1:1
import { Platform } from 'react-native';

export const colors = {
  bg: '#F2F2F7',
  bgDark: '#0A0A0B',
  card: '#FFFFFF',
  cardDark: '#1C1C1E',
  text: '#000000',
  textDark: '#FFFFFF',
  textSecondary: 'rgba(60,60,67,0.6)',
  textSecondaryDark: 'rgba(235,235,245,0.6)',
  textTertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.08)',
  separatorDark: 'rgba(84,84,88,0.65)',
  accent: '#26486E',
  success: '#2E5F5A',
  warning: '#C25B3A',
  warningText: '#A94A2D',
  yellow: '#F5C24E',
  qbGreen: '#2D8A4E',
};

export const statusMeta: Record<
  'processing' | 'needs-review' | 'ready' | 'synced',
  { label: string; bg: string; fg: string; dot: string }
> = {
  processing:    { label: 'Processing',    bg: 'rgba(60,60,67,0.08)',  fg: 'rgba(60,60,67,0.75)', dot: '#8E8E93' },
  'needs-review':{ label: 'Needs review',  bg: 'rgba(191,90,60,0.1)',  fg: '#A94A2D',             dot: '#C25B3A' },
  ready:         { label: 'Ready to sync', bg: 'rgba(38,72,110,0.08)', fg: colors.accent,         dot: colors.accent },
  synced:        { label: 'Synced',        bg: 'rgba(46,95,90,0.08)',  fg: '#2E5F5A',             dot: '#2E5F5A' },
};

// Font families — iOS uses SF system fonts by default; RN picks them up via undefined fontFamily
export const fonts = {
  sf: Platform.select({ ios: undefined, android: 'sans-serif' }),
  sfMono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }),
};

export const radius = {
  pill: 9999,
  card: 20,
  cardSm: 16,
  list: 26,
  control: 14,
};
