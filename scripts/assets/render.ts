// Rasterises the master SVGs in app/assets/source/ into app/assets/images/*.png with headless Chrome,
// and renders the illustration contact sheet (docs/design/illustrations/contact-sheet.png).
//
// The notification icon and the adaptive monochrome icon are then forced to pure white + alpha
// (Android only uses their alpha; the notification is tinted by the expo-notifications `color`).
// The script fails if either is not pure white afterwards.
//
// Run from the repo root (Windows; set CHROME to another path elsewhere):
//   npx -y deno@2 run --allow-read --allow-write --allow-run --allow-env scripts/assets/render.ts
// Only the contact sheet:  ... scripts/assets/render.ts --sheet
import { contactSheetHtml } from "./contact-sheet.ts";

const ROOT = new URL("../../", import.meta.url);
const CHROME = Deno.env.get("CHROME") ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

type Target = { src: string; out: string; width: number; height: number; whiteAlpha?: boolean };

/** Output sizes match the files Expo already used (icon 1024, adaptive 512, monochrome 432, ...). */
const TARGETS: Target[] = [
  { src: "icon.svg", out: "icon.png", width: 1024, height: 1024 },
  { src: "android-icon-foreground.svg", out: "android-icon-foreground.png", width: 512, height: 512 },
  { src: "android-icon-background.svg", out: "android-icon-background.png", width: 512, height: 512 },
  {
    src: "android-icon-monochrome.svg",
    out: "android-icon-monochrome.png",
    width: 432,
    height: 432,
    whiteAlpha: true,
  },
  { src: "splash-icon.svg", out: "splash-icon.png", width: 228, height: 213 },
  { src: "notification-icon.svg", out: "notification-icon.png", width: 96, height: 96, whiteAlpha: true },
  { src: "favicon.svg", out: "favicon.png", width: 48, height: 48 },
];

const tmp = await Deno.makeTempDir({ prefix: "lr-render-" });

async function screenshot(html: string, out: string, width: number, height: number) {
  const page = `${tmp}/page.html`;
  await Deno.writeTextFile(page, html);
  const { code, stderr } = await new Deno.Command(CHROME, {
    args: [
      "--headless=new",
      `--user-data-dir=${tmp}/chrome`,
      `--screenshot=${out}`,
      `--window-size=${width},${height}`,
      "--default-background-color=00000000",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `file:///${page.replaceAll("\\", "/")}`,
    ],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(`chrome failed: ${new TextDecoder().decode(stderr)}`);
}

/* ---- minimal PNG codec (8-bit RGBA, non-interlaced) for the white + alpha pass ---- */

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

type Image = { width: number; height: number; rgba: Uint8Array };

async function decodePng(png: Uint8Array): Promise<Image> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  let width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (off < png.length) {
    const len = view.getUint32(off);
    const type = new TextDecoder().decode(png.subarray(off + 4, off + 8));
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(off + 8);
      height = view.getUint32(off + 12);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("expected 8-bit RGBA PNG");
    } else if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = await inflate(new Uint8Array(idat.flatMap((c) => [...c])));
  const stride = width * 4;
  const rgba = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rgba[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, rgba };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function encodePng({ width, height, rgba }: Image): Promise<Uint8Array> {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

/** Keeps the alpha channel, sets every pixel's colour to white. */
function toWhiteAlpha(img: Image): Image {
  for (let i = 0; i < img.rgba.length; i += 4) img.rgba.set([255, 255, 255], i);
  return img;
}

function assertWhiteAlpha(img: Image, name: string) {
  let opaque = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i] !== 255 || img.rgba[i + 1] !== 255 || img.rgba[i + 2] !== 255) {
      throw new Error(`${name}: pixel ${i / 4} is not white`);
    }
    if (img.rgba[i + 3] > 0) opaque++;
  }
  if (opaque === 0) throw new Error(`${name}: empty`);
  console.log(`  ${name}: pure white + alpha, ${opaque} visible pixels`);
}

async function renderMasters() {
  for (const t of TARGETS) {
    const src = new URL(`app/assets/source/${t.src}`, ROOT).href;
    const out = new URL(`app/assets/images/${t.out}`, ROOT);
    const html = `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img src="${src}" style="display:block;width:${t.width}px;height:${t.height}px"></body></html>`;
    const file = decodeURIComponent(out.pathname).replace(/^\/([A-Za-z]:)/, "$1");
    await screenshot(html, file, t.width, t.height);
    const png = await Deno.readFile(out);
    const ihdr = new DataView(png.buffer, png.byteOffset + 16, 8);
    const [w, h] = [ihdr.getUint32(0), ihdr.getUint32(4)];
    if (w !== t.width || h !== t.height) {
      throw new Error(`${t.out}: got ${w}x${h}, want ${t.width}x${t.height}`);
    }
    if (t.whiteAlpha) {
      const img = toWhiteAlpha(await decodePng(png));
      await Deno.writeFile(out, await encodePng(img));
      assertWhiteAlpha(await decodePng(await Deno.readFile(out)), t.out);
    }
    console.log(`wrote app/assets/images/${t.out} (${t.width}x${t.height})`);
  }
}

async function renderSheet() {
  const dir = new URL("docs/design/illustrations/", ROOT);
  await Deno.mkdir(dir, { recursive: true });
  const out = decodeURIComponent(new URL("contact-sheet.png", dir).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  await screenshot(await contactSheetHtml(), out, 2000, 1560);
  console.log("wrote docs/design/illustrations/contact-sheet.png");
}

try {
  if (!Deno.args.includes("--sheet")) await renderMasters();
  await renderSheet();
} finally {
  await Deno.remove(tmp, { recursive: true }).catch(() => {});
}
