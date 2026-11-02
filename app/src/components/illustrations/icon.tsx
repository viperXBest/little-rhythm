import Svg, { Path } from "react-native-svg";

import { artA11y } from "@/components/illustrations/art-paths";
import {
  ICON_STROKE,
  ICONS,
  type IconName,
} from "@/components/illustrations/art-data";
import type { ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type IconProps = {
  name: IconName;
  /** Width and height in dp (24-unit grid). Checked at 20, 24 and 32. */
  size?: number;
  /** Outline colour token. Defaults to the icon's own tone (event colour, primary or text). */
  color?: ThemeColor;
  /** Duotone fill token, default `card`; e.g. `primaryPressed` on a filled button. */
  fill?: ThemeColor;
  /** Makes the icon an image for screen readers. Omit when a text label sits next to it. */
  accessibilityLabel?: string;
};

/** Duotone icon: a 1.9-unit outline in the tone colour, filled with `card`. */
export function Icon({
  name,
  size = 24,
  color,
  fill = "card",
  accessibilityLabel,
}: IconProps) {
  const theme = useTheme();
  const def = ICONS[name];
  const tone = theme[color ?? def.tone];
  const duo = "outlineOnly" in def && def.outlineOnly ? "none" : theme[fill];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...artA11y(accessibilityLabel)}
    >
      {def.parts.map(([kind, d], i) =>
        kind === "dot" ? (
          <Path key={i} d={d} fill={tone} />
        ) : (
          <Path
            key={i}
            d={d}
            fill={kind === "duo" ? duo : "none"}
            stroke={tone}
            strokeWidth={ICON_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
}
