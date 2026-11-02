import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Radius, Spacing, Sticker, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ShelfProps = {
  /** Corner radius of the face and the shelf. */
  radius: number;
  /** Colour of the hard shelf under the face; null draws none. */
  shelf: ThemeColor | null;
  /** True while pressed: the face sinks onto the shelf. */
  sunk?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * The "sticker" elevation: a hard 4 px shelf behind the face, offset straight down, no blur
 * (Android `elevation` can only blur). The wrapper reserves the 4 px, so layout doesn't
 * move when the face sinks. Use `Card` for cards; buttons use this directly.
 */
export function Shelf({ radius, shelf, sunk = false, style, faceStyle, children }: ShelfProps) {
  const theme = useTheme();
  const offset = shelf ? Sticker.shelf : 0;
  return (
    <View style={[{ paddingBottom: offset }, style]}>
      {shelf ? (
        <View
          pointerEvents="none"
          style={[styles.shelf, { top: offset, borderRadius: radius, backgroundColor: theme[shelf] }]}
        />
      ) : null}
      <View style={[{ borderRadius: radius }, sunk && { transform: [{ translateY: offset }] }, faceStyle]}>
        {children}
      </View>
    </View>
  );
}

export type CardProps = ViewProps & {
  /** Face fill (default `card`). Soft event fills (`feedSoft`, ...) work too. */
  tone?: ThemeColor;
  /** Outline colour (default `border`). */
  outline?: ThemeColor;
  /** Draw the hard shelf (default true). The escalation card never uses Card. */
  raised?: boolean;
  /** Inner padding (default Spacing.three). */
  padding?: number;
  /** Corner radius (default Radius.card). */
  radius?: number;
  children: ReactNode;
};

/** A sticker card: 2 px outline, `card` fill, hard 4 px shelf. `style` applies to the face. */
export function Card({
  tone = 'card',
  outline = 'border',
  raised = true,
  padding = Spacing.three,
  radius = Radius.card,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useTheme();
  return (
    <Shelf radius={radius} shelf={raised ? 'shelf' : null}>
      <View
        style={[
          styles.face,
          {
            borderRadius: radius,
            padding,
            backgroundColor: theme[tone],
            borderColor: theme[outline],
            borderWidth: Sticker.outline,
          },
          style,
        ]}
        {...rest}>
        {children}
      </View>
    </Shelf>
  );
}

const styles = StyleSheet.create({
  shelf: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  face: { gap: Spacing.two },
});
