import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

// Colours live in palette.ts (contrast-tested); every component reads them through useTheme().
export { Colors, type Palette, type ThemeColor } from '@/constants/palette';

/** System families (kept for monospace codes and as the fallback when the custom fonts fail). */
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Custom families, one registered name per weight (Android does not pick a weight from
 * `fontWeight` for custom fonts). heading = Baloo 2 (headings, baby name, big times, button
 * labels); body = Nunito (body, labels, captions, chat). Loaded in app/_layout.tsx.
 */
export const FontFamily = {
  heading: { 600: 'Baloo2_600SemiBold', 700: 'Baloo2_700Bold', 800: 'Baloo2_800ExtraBold' },
  body: { 400: 'Nunito_400Regular', 600: 'Nunito_600SemiBold', 700: 'Nunito_700Bold', 800: 'Nunito_800ExtraBold' },
} as const;

export type FontRole = keyof typeof FontFamily;

// Set once by the root layout before anything renders: false when the fonts failed to load,
// so text falls back to the system font with a real fontWeight instead of a missing family.
let customFonts = true;
export function setCustomFontsAvailable(available: boolean) {
  customFonts = available;
}

/**
 * The style for a font role and weight: the nearest bundled weight's family (and no
 * fontWeight), or the system font with that weight if the custom fonts are unavailable.
 */
export function font(role: FontRole, weight: number): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  if (!customFonts) return { fontWeight: String(weight) as TextStyle['fontWeight'] };
  const families = FontFamily[role] as Record<number, string>;
  const weights = Object.keys(families).map(Number);
  const nearest = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return { fontFamily: families[nearest] };
}

/**
 * Type scale (direction C, body font Nunito). Sizes in dp; text scales with the system
 * font size. Body text is at least 16. Use these through `<ThemedText type="...">`.
 */
export const TypeScale = {
  /** Baby name. */
  display: { role: 'heading', weight: 800, fontSize: 46, lineHeight: 56 },
  /** Screen titles. */
  title: { role: 'heading', weight: 700, fontSize: 30, lineHeight: 40 },
  /** Section and screen headings (the v1.0 "subtitle"). */
  subtitle: { role: 'heading', weight: 700, fontSize: 24, lineHeight: 32 },
  /** Card titles. */
  cardTitle: { role: 'heading', weight: 700, fontSize: 21, lineHeight: 28 },
  /** Big Next up times and the stepper value. */
  time: { role: 'heading', weight: 700, fontSize: 23, lineHeight: 30 },
  /** Quick-log button labels. */
  buttonLarge: { role: 'heading', weight: 700, fontSize: 19, lineHeight: 26 },
  /** Button labels. */
  button: { role: 'heading', weight: 700, fontSize: 17, lineHeight: 24 },
  /** Body and chat text. */
  default: { role: 'body', weight: 400, fontSize: 17, lineHeight: 25 },
  /** Body, emphasised. */
  defaultBold: { role: 'body', weight: 700, fontSize: 17, lineHeight: 25 },
  /** Labels and short secondary lines. */
  small: { role: 'body', weight: 600, fontSize: 15, lineHeight: 22 },
  smallBold: { role: 'body', weight: 700, fontSize: 15, lineHeight: 22 },
  /** Basis lines, meta (times under bubbles). */
  caption: { role: 'body', weight: 700, fontSize: 13, lineHeight: 18 },
  /** Text links (colour: theme.link). */
  link: { role: 'body', weight: 700, fontSize: 15, lineHeight: 22 },
  linkPrimary: { role: 'body', weight: 700, fontSize: 15, lineHeight: 22 },
} as const satisfies Record<string, { role: FontRole; weight: number; fontSize: number; lineHeight: number }>;

export type TypeVariant = keyof typeof TypeScale;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii (direction C). */
export const Radius = {
  /** Chips and small tiles inside cards. */
  small: 12,
  /** Fields, the segment track, the escalation card. */
  field: 14,
  /** Buttons and timeline rows. */
  button: 16,
  /** The floating Chat button. */
  fab: 20,
  /** Sticker cards. */
  card: 22,
  /** Bubbles. */
  bubble: 20,
  pill: 999,
} as const;

/** The "sticker" elevation: a 2 px outline and a hard 4 px shelf, no blur (see components/card.tsx). */
export const Sticker = {
  outline: 2,
  shelf: 4,
} as const;

/** Minimum touch target. */
export const MinTouch = 48;

export const MaxContentWidth = 800;
