import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, font, ThemeColor, TypeScale, type TypeVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /** A type-scale variant (constants/theme.ts), or `code` for monospace codes. */
  type?: TypeVariant | 'code';
  themeColor?: ThemeColor;
};

/**
 * Text in the type scale. A `fontWeight` in `style` picks the matching bundled weight of the
 * variant's family (Android can't synthesise weights for custom fonts); an explicit
 * `fontFamily` in `style` is kept as is.
 */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  // Links are always the link colour; other types follow themeColor (default: text).
  const color = type === 'linkPrimary' ? theme.link : theme[themeColor ?? 'text'];

  if (type === 'code') return <Text style={[{ color }, styles.code, style]} {...rest} />;

  const spec = TypeScale[type];
  const flat: TextStyle = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...own } = flat;
  const weight = fontWeight === undefined ? spec.weight : weightNumber(fontWeight, spec.weight);
  const family = own.fontFamily ? { fontWeight } : font(spec.role, weight);
  return (
    <Text
      style={[{ color, fontSize: spec.fontSize, lineHeight: spec.lineHeight }, family, own]}
      {...rest}
    />
  );
}

function weightNumber(weight: NonNullable<TextStyle['fontWeight']>, fallback: number): number {
  if (typeof weight === 'number') return weight;
  if (weight === 'bold') return 700;
  if (weight === 'normal') return 400;
  const n = Number(weight);
  return Number.isFinite(n) ? n : fallback;
}

const styles = StyleSheet.create({
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
