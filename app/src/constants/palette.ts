/**
 * Every colour in the app. Meta-aligned blues and greys (no Meta logo, wordmark or
 * gradient). No imports, so palette.test.ts can check the contrast under Deno.
 *
 * Roles:
 * - primary: fills only (buttons, the selected segment). Label: onPrimary (white).
 * - link: text links. focus: the focused-field ring.
 * - accent: highlights and marks (the Next up bar, the night-feed bar). Never text.
 * - error: borders, icons and fills with white text. errorText: error messages.
 * - success: icons on the page background only (3.3:1 on white: too low for text,
 *   and under 3:1 on surface).
 * - border: decorative dividers and outlines. Fields are also told apart by their
 *   surface fill and label.
 * - warningBackground: the escalation card.
 */
export const Colors = {
  light: {
    text: '#1C2B33',
    textSecondary: '#65676B',
    background: '#FFFFFF',
    surface: '#F0F2F5',
    border: '#DADDE1',
    primary: '#0064E0',
    primaryPressed: '#0050B8',
    onPrimary: '#FFFFFF',
    accent: '#0081FB',
    link: '#0064E0',
    focus: '#0064E0',
    infoBackground: '#E7F3FF',
    success: '#31A24C',
    error: '#E41E3F',
    errorText: '#C8102E',
    warningBackground: '#FDECEE',
  },
  dark: {
    text: '#E4E6EB',
    textSecondary: '#B0B3B8',
    background: '#18191A',
    surface: '#242526',
    border: '#3E4042',
    // Buttons keep the light primary: white on #0081FB is only 3.8:1.
    primary: '#0064E0',
    primaryPressed: '#0050B8',
    onPrimary: '#FFFFFF',
    accent: '#0081FB',
    // A lighter tint of the same blue, so link text passes on the surface too.
    link: '#4599FF',
    focus: '#0081FB',
    infoBackground: '#1B2B40',
    success: '#31A24C',
    error: '#E41E3F',
    errorText: '#FF7083',
    warningBackground: '#3B2024',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = { readonly [K in ThemeColor]: string };
