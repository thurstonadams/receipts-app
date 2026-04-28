// Design tokens.
//
// Two visual systems coexist here during the migration:
//
//   1. `colors`           — the original palette used by the existing screens
//                           (Home, Capture, Review, Search, etc.). Keeps the
//                           navy + warm-grey + soft-cream feel.
//
//   2. `colors.modern`    — the new modern white aesthetic introduced for
//                           the KAI Reports flow. Pure white surfaces, near-
//                           black ink (#09090B), Inter-style system font
//                           with strong tabular numerals, semantic stat
//                           colors (amber pending, green paid, red overdue).
//
// New screens should reach into `modern.*`. Old screens migrate over time.
//
// Typography note: we use the iOS system stack (SF Pro Display/Text) rather
// than shipping Inter as a font asset. SF Pro on iOS is visually almost
// identical to Inter for our purposes, and avoids a font-loading dance and
// the build-size cost. If we ever want true Inter, drop the .ttf into
// assets/fonts and swap the family below; nothing else changes.
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

  // ─── Modern white palette (Reports + future redesigns) ────────────────
  modern: {
    // Surfaces
    pageBg:         '#F5F5F4',  // the "desk" — page background behind cards
    surface:        '#FFFFFF',  // card/sheet bg
    surfaceMuted:   '#FAFAFA',  // subtle alt row
    surfaceHover:   '#F4F4F5',  // pressed/inline-edit highlight

    // Ink
    ink:            '#09090B',  // primary text — near-black, never pure
    inkSecondary:   '#52525B',  // body secondary
    inkTertiary:    '#71717A',  // labels, hints, eyebrows
    inkQuaternary:  '#A1A1AA',  // disabled / very subtle

    // Lines
    border:         'rgba(9,9,11,0.08)',
    borderStrong:   'rgba(9,9,11,0.16)',
    rule:           '#09090B',  // for hairline rules above totals etc.

    // Semantic / stat colors
    amber:          '#D97706',  // pending / awaiting payment
    amberSoft:      '#FEF3C7',
    amberInk:       '#92400E',

    green:          '#059669',  // paid / completed
    greenSoft:      '#D1FAE5',
    greenInk:       '#065F46',

    blue:           '#2563EB',  // sent / in-flight
    blueSoft:       '#DBEAFE',
    blueInk:        '#1E40AF',

    red:            '#DC2626',  // overdue / errors
    redSoft:        '#FEE2E2',
    redInk:         '#991B1B',

    // Brand accent (kept for primary actions where the brand should show)
    brand:          '#26486E',
  },
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

// Status pill metadata for invoice/report states.
export const reportStatusMeta: Record<
  'draft' | 'ready' | 'sent' | 'paid' | 'overdue' | 'void',
  { label: string; bg: string; fg: string }
> = {
  draft:   { label: 'Draft',   bg: 'rgba(9,9,11,0.06)',     fg: '#52525B' },
  ready:   { label: 'Ready',   bg: colors.modern.amberSoft, fg: colors.modern.amberInk },
  sent:    { label: 'Sent',    bg: colors.modern.blueSoft,  fg: colors.modern.blueInk  },
  paid:    { label: 'Paid',    bg: colors.modern.greenSoft, fg: colors.modern.greenInk },
  overdue: { label: 'Overdue', bg: colors.modern.redSoft,   fg: colors.modern.redInk   },
  void:    { label: 'Void',    bg: 'rgba(9,9,11,0.06)',     fg: '#A1A1AA' },
};

// Font families.
//   `sf`   — primary sans (system on both platforms; SF Pro on iOS).
//   `sfMono` — monospace for legacy screens; new screens use `numeric` instead.
//   `numeric` — same family as sf, intended to be used with the
//               `fontVariant: ['tabular-nums']` style prop so digits sit on
//               a strict grid. This is the modern way — no separate mono
//               font is needed for column-aligned amounts.
export const fonts = {
  sf:      Platform.select({ ios: undefined, android: 'sans-serif' }),
  sfMono:  Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }),
  numeric: Platform.select({ ios: undefined, android: 'sans-serif' }),
};

// Reusable typography presets for the modern aesthetic. Apply via
// `<Text style={[type.h1, ...]}>`. Keep weight to "400" or "500" only —
// 600/700 read as heavy in modern UI.
export const type = {
  // Display / hero numbers
  hero:        { fontSize: 28, fontWeight: '500' as const, letterSpacing: -0.6, color: colors.modern.ink },
  // Headings
  h1:          { fontSize: 22, fontWeight: '500' as const, letterSpacing: -0.5, color: colors.modern.ink },
  h2:          { fontSize: 17, fontWeight: '500' as const, letterSpacing: -0.3, color: colors.modern.ink },
  h3:          { fontSize: 14, fontWeight: '500' as const, letterSpacing: -0.15, color: colors.modern.ink },
  // Body
  body:        { fontSize: 14, fontWeight: '400' as const, color: colors.modern.ink, lineHeight: 20 },
  bodySmall:   { fontSize: 12, fontWeight: '400' as const, color: colors.modern.inkSecondary, lineHeight: 17 },
  caption:     { fontSize: 11, fontWeight: '400' as const, color: colors.modern.inkTertiary, lineHeight: 15 },
  // Labels / eyebrows — small caps with tracking
  eyebrow:     { fontSize: 10, fontWeight: '500' as const, letterSpacing: 1, color: colors.modern.inkTertiary, textTransform: 'uppercase' as const },
};

export const radius = {
  pill: 9999,
  card: 20,
  cardSm: 16,
  list: 26,
  control: 14,
};
