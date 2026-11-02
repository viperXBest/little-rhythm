import Svg, { G } from "react-native-svg";

import {
  MASCOT,
  SCENES,
  type SceneName,
} from "@/components/illustrations/art-data";
import { ArtPaths, artA11y } from "@/components/illustrations/art-paths";
import { useTheme } from "@/hooks/use-theme";

export type IllustrationProps = {
  /** emptyTimeline · emptyChat · checkinWaiting · invitePartner · error (calm, no mascot) */
  name: SceneName;
  /** Width in dp; the height follows (220:140). */
  size?: number;
  accessibilityLabel?: string;
};

/** Empty-state and error artwork. Never on the escalation card or next to health text. */
export function Illustration({
  name,
  size = 220,
  accessibilityLabel,
}: IllustrationProps) {
  const theme = useTheme();
  const scene = SCENES[name];
  const m = scene.mascot;
  return (
    <Svg
      width={size}
      height={(size * scene.height) / scene.width}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      {...artA11y(accessibilityLabel)}
    >
      <ArtPaths shapes={scene.back} theme={theme} />
      {m ? (
        <G transform={`translate(${m.x} ${m.y}) scale(${m.scale})`}>
          <ArtPaths shapes={MASCOT[m.pose]} theme={theme} />
        </G>
      ) : null}
      <ArtPaths shapes={scene.front} theme={theme} />
    </Svg>
  );
}
