// Contact sheet: every icon (at 20, 24 and 32 dp and 64 for detail), mascot pose and scene, in light
// and dark, rendered from the same data as the app components. Writes an HTML file; render.ts turns
// it into docs/design/illustrations/contact-sheet.png.
import { ICON_NAMES, MASCOT, SCENES } from "../../app/src/components/illustrations/art-data.ts";
import type { MascotPose, SceneName } from "../../app/src/components/illustrations/art-data.ts";
import { type Colours, iconSvg, mascotSvg, sceneSvg } from "./art-svg.ts";
import { Colors } from "../../app/src/constants/palette.ts";

/** The palette from palette.ts; until it has the direction C tokens, the spec values. */
export async function themes(): Promise<{ light: Colours; dark: Colours }> {
  const p = Colors as unknown as { light: Record<string, string>; dark: Record<string, string> };
  if ("card" in p.light && "feed" in p.light) {
    return { light: p.light as Colours, dark: p.dark as Colours };
  }
  const url = new URL("../../docs/design/tools/palettes.json", import.meta.url);
  const all = JSON.parse(await Deno.readTextFile(url));
  return all["c-cloud-lullaby"];
}

function half(label: string, c: Colours): string {
  const icons = ICON_NAMES.map((n) =>
    `<div class="ic"><div class="sizes">${iconSvg(n, c, 20)}${iconSvg(n, c, 24)}${iconSvg(n, c, 32)}</div>` +
    `<div class="big">${iconSvg(n, c, 64)}</div><span>${n}</span></div>`
  ).join("");
  const onFill =
    `<div class="ic"><div class="sizes" style="background:${c.primary};border-radius:12px;padding:6px">` +
    `${iconSvg("mic", { ...c, primary: c.onPrimary }, 32, "primaryPressed")}` +
    `${
      iconSvg("chat", { ...c, primary: c.onPrimary }, 32, "primaryPressed")
    }</div><span>on primary</span></div>`;
  const poses = (Object.keys(MASCOT) as MascotPose[]).map((p) =>
    `<div class="cell">${mascotSvg(p, c, 180)}<span>Mascot pose="${p}"</span></div>`
  ).join("");
  const scenes = (Object.keys(SCENES) as SceneName[]).map((s) =>
    `<div class="cell">${sceneSvg(s, c, 220)}<span>Illustration name="${s}"</span></div>`
  ).join("");
  return `<section style="background:${c.background};color:${c.text}"><h2>${label}</h2>` +
    `<div class="row">${poses}</div><div class="row">${scenes}</div><div class="icons">${icons}${onFill}</div></section>`;
}

export async function contactSheetHtml(): Promise<string> {
  const t = await themes();
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:600 13px system-ui,sans-serif;display:flex}
section{width:1000px;padding:24px;box-sizing:border-box}
h2{margin:0 0 12px;font-size:22px}
.row{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px}
.cell{display:flex;flex-direction:column;align-items:center;gap:4px;width:222px}
.icons{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.ic{display:flex;flex-direction:column;align-items:center;gap:4px}
.sizes{display:flex;align-items:center;gap:8px}
</style><body>${half("Light", t.light)}${half("Dark", t.dark)}</body>`;
}

if (import.meta.main) {
  const out = Deno.args[0] ?? "contact-sheet.html";
  await Deno.writeTextFile(out, await contactSheetHtml());
  console.log(`wrote ${out}`);
}
