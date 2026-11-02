// Usage: node contrast.mjs palettes.json [name]  -> prints markdown tables, exits 1 on any failure.
import fs from 'node:fs';
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
// Existing pairs from app/src/constants/palette.test.ts, plus pairs for the new tokens.
const TEXT = [
  ['text','background'],['text','surface'],['text','border'],['text','infoBackground'],['text','warningBackground'],
  ['textSecondary','background'],['textSecondary','surface'],['textSecondary','warningBackground'],
  ['link','background'],['link','surface'],['onPrimary','primary'],['onPrimary','primaryPressed'],['onPrimary','error'],
  ['errorText','background'],['errorText','surface'],['errorText','warningBackground'],
  // new
  ['text','card'],['textSecondary','card'],['link','card'],['errorText','card'],['textSecondary','infoBackground'],
  ['text','feedSoft'],['text','sleepSoft'],['text','diaperSoft'],
  ['textSecondary','feedSoft'],['textSecondary','sleepSoft'],['textSecondary','diaperSoft'],
];
const NON_TEXT = [
  ['focus','background'],['focus','surface'],['accent','background'],['accent','surface'],
  ['success','background'],['error','warningBackground'],['primary','background'],
  // new
  ['focus','card'],['accent','card'],['primary','card'],['success','card'],
  ['feed','background'],['feed','card'],['feed','feedSoft'],
  ['sleep','background'],['sleep','card'],['sleep','sleepSoft'],
  ['diaper','background'],['diaper','card'],['diaper','diaperSoft'],
];
const all = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let failed = 0;
for (const [name, schemes] of Object.entries(all)) {
  if (process.argv[3] && process.argv[3] !== name) continue;
  console.log(`\n### ${name}\n\n| Pair (fg on bg) | Min | Light | Dark |\n|---|---|---|---|`);
  for (const [pairs, min] of [[TEXT, 4.5], [NON_TEXT, 3]]) for (const [fg, bg] of pairs) {
    const cells = ['light', 'dark'].map((s) => {
      const p = schemes[s];
      if (!p[fg] || !p[bg]) { failed++; return `MISSING ${fg}/${bg}`; }
      const r = ratio(p[fg], p[bg]);
      if (r < min) failed++;
      return `${r.toFixed(2)}:1${r < min ? ' **FAIL**' : ''}`;
    });
    console.log(`| ${fg} on ${bg} | ${min}:1 | ${cells[0]} | ${cells[1]} |`);
  }
}
console.error(failed ? `\n${failed} FAILURES` : '\nall pass');
process.exit(failed ? 1 : 0);
