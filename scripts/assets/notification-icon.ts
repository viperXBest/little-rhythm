// Draws the Android notification icon: 96x96 (xxxhdpi), white on transparent, a
// crescent moon and a small star. No text and no logo. Android tints it with the
// expo-notifications `color` (app.json). Reproducible; run from the repo root:
//   npx -y deno@2 run --allow-write=app/assets/images scripts/assets/notification-icon.ts
const SIZE = 96;
const SAMPLES = 4; // 4x4 supersampling for smooth edges
const OUT = "app/assets/images/notification-icon.png";

const inCircle = (x: number, y: number, cx: number, cy: number, r: number) =>
  (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** True where the glyph is: inside the moon but outside its bite, or inside the star. */
function covered(x: number, y: number): boolean {
  const moon = inCircle(x, y, 44, 52, 34) && !inCircle(x, y, 60, 38, 28);
  const star = inCircle(x, y, 74, 22, 6);
  return moon || star;
}

const pixels = new Uint8Array(SIZE * (SIZE * 4 + 1)); // each row: filter byte 0, then RGBA
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  for (let x = 0; x < SIZE; x++) {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        if (covered(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)) hits++;
      }
    }
    const i = row + 1 + x * 4;
    pixels.set([255, 255, 255, Math.round((255 * hits) / (SAMPLES * SAMPLES))], i);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const header = new Uint8Array(13);
const hv = new DataView(header.buffer);
hv.setUint32(0, SIZE);
hv.setUint32(4, SIZE);
header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace

const parts = [
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", await deflate(pixels)),
  chunk("IEND", new Uint8Array()),
];
const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
let offset = 0;
for (const p of parts) {
  png.set(p, offset);
  offset += p.length;
}
await Deno.writeFile(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes)`);
