// WCAG 2.x contrast for every foreground/background pair the app uses (v1.1.0 Cloud Lullaby).
// Text needs 4.5:1 (AA, normal size). Large text (>= 18.66 px bold or >= 24 px regular) may use
// 3:1, but only pairs listed in LARGE_TEXT; none today, so no small text relies on it. Focus
// rings, accents, icons, UI boundaries and the escalation border need 3:1 (non-text).
// Run under Deno:
//   npx -y deno@2 test app/src/constants/palette.test.ts
import { assert } from "jsr:@std/assert@1.0.13";

import { Colors, type Palette, type ThemeColor } from "./palette.ts";

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
  ["text", "background"],
  ["text", "surface"],
  ["text", "border"],
  ["text", "infoBackground"],
  ["text", "warningBackground"],
  ["text", "card"],
  ["text", "feedSoft"],
  ["text", "sleepSoft"],
  ["text", "diaperSoft"],
  ["textSecondary", "background"],
  ["textSecondary", "surface"],
  ["textSecondary", "card"],
  ["textSecondary", "infoBackground"],
  ["textSecondary", "warningBackground"],
  ["textSecondary", "feedSoft"],
  ["textSecondary", "sleepSoft"],
  ["textSecondary", "diaperSoft"],
  ["link", "background"],
  ["link", "surface"],
  ["link", "card"],
  ["textSecondary", "border"], // date field pressed (its label)
  ["link", "border"], // date field pressed ("Change ›")
  ["onPrimary", "primary"],
  ["onPrimary", "primaryPressed"],
  ["onPrimary", "error"], // danger buttons, "Call 112", the mic while recording
  ["onPrimaryTint", "primaryTint"], // quick-log labels, the parent's own bubbles
  ["onPrimaryTint", "primaryTintPressed"],
  ["errorText", "background"],
  ["errorText", "surface"],
  ["errorText", "card"],
  ["errorText", "warningBackground"],
];

// Large text only (>= 18.66 px bold or >= 24 px regular). Keep empty unless a pair needs it.
const LARGE_TEXT: Pair[] = [];

const NON_TEXT: Pair[] = [
  ["focus", "background"],
  ["focus", "surface"],
  ["focus", "card"],
  ["accent", "background"],
  ["accent", "surface"],
  ["accent", "card"],
  ["success", "background"],
  ["success", "card"],
  ["error", "warningBackground"], // the escalation border
  ["error", "background"], // a danger button's edge
  ["error", "card"],
  ["primary", "background"], // a button's edge against the page
  ["primary", "card"],
  ["primary", "surface"], // selected chip / active segment on the surface track
  ["primary", "sleepSoft"], // the Next up highlight outline on a sleep tile
  ["primary", "feedSoft"], // the Next up highlight outline on a feed tile
  ["error", "surface"], // a field's error outline
  ["primaryTintBorder", "background"], // dark-glare: the tinted button's outline
  ["primaryTintBorder", "card"],
  ["primaryTintBorder", "surface"], // the chat mic and Send above the composer
  ["primaryTintIcon", "primaryTint"], // the icon on a quick-log button
  ["primaryTintIcon", "primaryTintPressed"],
  ["feed", "background"],
  ["feed", "card"],
  ["feed", "surface"],
  ["feed", "feedSoft"],
  ["sleep", "background"],
  ["sleep", "card"],
  ["sleep", "sleepSoft"],
  ["diaper", "background"],
  ["diaper", "card"],
  ["diaper", "diaperSoft"],
];

for (const [scheme, palette] of Object.entries(Colors) as [string, Palette][]) {
  for (const [pairs, min] of [[TEXT, 4.5], [LARGE_TEXT, 3], [NON_TEXT, 3]] as const) {
    for (const [fg, bg] of pairs) {
      Deno.test(`${scheme}: ${fg} on ${bg} is at least ${min}:1`, () => {
        const ratio = contrast(palette[fg], palette[bg]);
        assert(ratio >= min, `${palette[fg]} on ${palette[bg]} is ${ratio.toFixed(2)}:1`);
      });
    }
  }
}

Deno.test("both themes define the same tokens", () => {
  const keys = (p: Palette) => JSON.stringify(Object.keys(p).sort());
  assert(keys(Colors.light) === keys(Colors.dark));
});

// Pinned: the Cloud Lullaby values from docs/design/tools/palettes.json (direction C).
const PINNED: Record<"light" | "dark", Partial<Record<ThemeColor, string>>> = {
  light: {
    text: "#24213F",
    textSecondary: "#5A5676",
    background: "#F6F5FC",
    surface: "#ECEAF8",
    card: "#FFFFFF",
    border: "#D5D1EC",
    primary: "#5146B8",
    primaryPressed: "#42399A",
    onPrimary: "#FFFFFF",
    accent: "#7066D8",
    link: "#4A40AE",
    focus: "#5146B8",
    infoBackground: "#E6E4FA",
    success: "#2F8A5E",
    error: "#C9304B",
    errorText: "#A8203A",
    warningBackground: "#FCE8EC",
    feed: "#B8650F",
    feedSoft: "#FCEFD9",
    sleep: "#6355CC",
    sleepSoft: "#E6E4FA",
    diaper: "#23808F",
    diaperSoft: "#DAF0F2",
  },
  dark: {
    text: "#E7E5F7",
    textSecondary: "#B4B1D3",
    background: "#191A2E",
    surface: "#232540",
    card: "#272A47",
    border: "#3C3F63",
    primary: "#A9A2F5",
    primaryPressed: "#9089E8",
    onPrimary: "#1B1840",
    accent: "#A9A2F5",
    link: "#B9B3FA",
    focus: "#A9A2F5",
    infoBackground: "#2A2C52",
    success: "#7FD1A4",
    error: "#EE6A6F",
    errorText: "#FF9AAA",
    warningBackground: "#3D2230",
    feed: "#F2C179",
    feedSoft: "#3A3024",
    sleep: "#A9A2F5",
    sleepSoft: "#2C2B52",
    diaper: "#7FD3DE",
    diaperSoft: "#1F3540",
  },
};

Deno.test("both themes use the Cloud Lullaby palette exactly", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const [token, value] of Object.entries(PINNED[scheme])) {
      assert(Colors[scheme][token as ThemeColor] === value, `${scheme}.${token}`);
    }
  }
});

Deno.test("dark-glare rule: light keeps the full primary fill, dark uses the tint", () => {
  assert(Colors.light.primaryTint === Colors.light.primary);
  assert(Colors.light.onPrimaryTint === Colors.light.onPrimary);
  assert((Colors.dark.primaryTint as string) !== Colors.dark.primary);
  assert(Colors.dark.primaryTintBorder === Colors.dark.primary);
  assert(Colors.dark.primaryTintIcon === Colors.dark.primary);
});
