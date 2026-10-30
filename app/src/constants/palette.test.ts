// WCAG 2.x contrast for every foreground/background pair the app uses.
// Text needs 4.5:1 (AA, normal size); focus rings, accents, icons and the
// escalation border need 3:1 (non-text). Run under Deno:
//   npx -y deno@2 test app/src/constants/palette.test.ts
import { assert } from 'jsr:@std/assert@1.0.13';

import { Colors, type Palette, type ThemeColor } from './palette.ts';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = [fg: ThemeColor, bg: ThemeColor];

const TEXT: Pair[] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'border'], // stepper buttons
  ['text', 'infoBackground'],
  ['text', 'warningBackground'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'warningBackground'],
  ['link', 'background'],
  ['link', 'surface'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'primaryPressed'],
  ['onPrimary', 'error'], // the mic button while recording
  ['errorText', 'background'],
  ['errorText', 'surface'],
  ['errorText', 'warningBackground'],
];

const NON_TEXT: Pair[] = [
  ['focus', 'background'],
  ['focus', 'surface'],
  ['accent', 'background'],
  ['accent', 'surface'],
  // success is used on the page background only (2.9:1 on surface is too low).
  ['success', 'background'],
  ['error', 'warningBackground'],
  ['primary', 'background'], // a button's edge against the page
];

for (const [scheme, palette] of Object.entries(Colors) as [string, Palette][]) {
  for (const [pairs, min] of [[TEXT, 4.5], [NON_TEXT, 3]] as const) {
    for (const [fg, bg] of pairs) {
      Deno.test(`${scheme}: ${fg} on ${bg} is at least ${min}:1`, () => {
        const ratio = contrast(palette[fg], palette[bg]);
        assert(ratio >= min, `${palette[fg]} on ${palette[bg]} is ${ratio.toFixed(2)}:1`);
      });
    }
  }
}

Deno.test('light uses the given palette exactly', () => {
  const given: Partial<Record<ThemeColor, string>> = {
    primary: '#0064E0',
    primaryPressed: '#0050B8',
    accent: '#0081FB',
    text: '#1C2B33',
    textSecondary: '#65676B',
    background: '#FFFFFF',
    surface: '#F0F2F5',
    border: '#DADDE1',
    infoBackground: '#E7F3FF',
    success: '#31A24C',
    error: '#E41E3F',
  };
  for (const [token, value] of Object.entries(given)) {
    assert(Colors.light[token as ThemeColor] === value, token);
  }
  assert(Colors.dark.accent === '#0081FB' && Colors.dark.focus === '#0081FB');
});
