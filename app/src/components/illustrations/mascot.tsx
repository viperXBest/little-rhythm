import Svg from "react-native-svg";

import {
  MASCOT,
  MASCOT_VIEWBOX,
  type MascotPose,
} from "@/components/illustrations/art-data";
import { ArtPaths, artA11y } from "@/components/illustrations/art-paths";
import { useTheme } from "@/hooks/use-theme";

export type MascotProps = {
  /** sleeping: home header · awake: welcome, onboarding, sign-in · waiting: partner pending · cosy: empty states */
  pose?: MascotPose;
  /** Width in dp; the height follows (150:120). */
  size?: number;
  accessibilityLabel?: string;
};

/** Fluff, the cloud-sheep. Never on the escalation card, in error states or near health text. */
export function Mascot({
  pose = "sleeping",
  size = 120,
  accessibilityLabel,
}: MascotProps) {
  const theme = useTheme();
  const { width, height } = MASCOT_VIEWBOX;
  return (
    <Svg
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      {...artA11y(accessibilityLabel)}
    >
      <ArtPaths shapes={MASCOT[pose]} theme={theme} />
    </Svg>
  );
}
