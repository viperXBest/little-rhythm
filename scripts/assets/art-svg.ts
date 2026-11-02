// Renders the app's illustration data (app/src/components/illustrations/art-data.ts) to SVG strings,
// with the same drawing rules as the react-native-svg components. Used by render.ts for the contact
// sheet, so the sheet shows exactly the geometry that ships.
import {
  type ArtShape,
  type ArtToken,
  ICON_STROKE,
  type IconName,
  ICONS,
  MASCOT,
  MASCOT_VIEWBOX,
  type MascotPose,
  type SceneName,
  SCENES,
} from "../../app/src/components/illustrations/art-data.ts";

export type Colours = Record<ArtToken, string>;

function shape(s: ArtShape, c: Colours): string {
  const attrs = [
    `d="${s.d}"`,
    `fill="${s.fill ? c[s.fill] : "none"}"`,
    s.stroke ? `stroke="${c[s.stroke]}" stroke-width="${s.width ?? 2}"` : "",
    s.stroke ? `stroke-linecap="round" stroke-linejoin="round"` : "",
    s.dash ? `stroke-dasharray="${s.dash}"` : "",
    s.transform ? `transform="${s.transform}"` : "",
  ];
  return `<path ${attrs.filter(Boolean).join(" ")}/>`;
}

export function mascotBody(pose: MascotPose, c: Colours): string {
  return MASCOT[pose].map((s) => shape(s, c)).join("");
}

export function mascotSvg(pose: MascotPose, c: Colours, width: number): string {
  const { width: w, height: h } = MASCOT_VIEWBOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${(width * h) / w}" ` +
    `viewBox="0 0 ${w} ${h}">${mascotBody(pose, c)}</svg>`;
}

export function sceneSvg(name: SceneName, c: Colours, width: number): string {
  const sc = SCENES[name];
  const m = sc.mascot
    ? `<g transform="translate(${sc.mascot.x} ${sc.mascot.y}) scale(${sc.mascot.scale})">${
      mascotBody(sc.mascot.pose, c)
    }</g>`
    : "";
  const body = sc.back.map((s) => shape(s, c)).join("") + m + sc.front.map((s) => shape(s, c)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${
    (width * sc.height) / sc.width
  }" ` +
    `viewBox="0 0 ${sc.width} ${sc.height}">${body}</svg>`;
}

export function iconSvg(name: IconName, c: Colours, size: number, fill: ArtToken = "card"): string {
  const def = ICONS[name];
  const tone = c[def.tone];
  const duo = "outlineOnly" in def && def.outlineOnly ? "none" : c[fill];
  const parts = def.parts.map(([kind, d]) => {
    if (kind === "dot") return `<path d="${d}" fill="${tone}"/>`;
    return `<path d="${d}" fill="${kind === "duo" ? duo : "none"}" stroke="${tone}" ` +
      `stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${
    parts.join("")
  }</svg>`;
}
