import { Path } from "react-native-svg";

import type { ArtShape, ArtToken } from "@/components/illustrations/art-data";
import type { Palette, ThemeColor } from "@/constants/theme";

// Compile-time check: every token the artwork uses exists in the app palette.
type AssertTokens<T extends ThemeColor> = T;
export type ArtThemeToken = AssertTokens<ArtToken>;

/** Accessibility props: decorative (hidden) unless a label is given, then one image. */
export function artA11y(accessibilityLabel: string | undefined) {
  return accessibilityLabel
    ? ({
        accessible: true,
        accessibilityRole: "image",
        accessibilityLabel,
      } as const)
    : ({
        accessible: false,
        importantForAccessibility: "no-hide-descendants",
      } as const);
}

/** Draws art-data shapes with colours from the current theme. */
export function ArtPaths({
  shapes,
  theme,
}: {
  shapes: readonly ArtShape[];
  theme: Palette;
}) {
  return (
    <>
      {shapes.map((s, i) => (
        <Path
          key={i}
          d={s.d}
          fill={s.fill ? theme[s.fill] : "none"}
          stroke={s.stroke ? theme[s.stroke] : undefined}
          strokeWidth={s.stroke ? (s.width ?? 2) : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.dash}
          transform={s.transform}
        />
      ))}
    </>
  );
}
