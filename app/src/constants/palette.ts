/**
 * Every colour in the app. v1.1.0 "Cloud Lullaby": periwinkle and indigo on lilac-white,
 * a night-sky navy in dark mode (docs/design/system.md). No imports, so palette.test.ts can
 * check the contrast under Deno.
 *
 * Roles:
 * - text / textSecondary: body and secondary text (basis lines, meta).
 * - background: the page. surface: fields, segment track, secondary buttons.
 *   card: cards and the assistant's bubbles (the elevated "sticker" surface).
 * - border: decorative dividers and the 2 px sticker outline.
 *   shelf: the hard 4 px drop under sticker cards (no blur). Never text.
 * - primary: full fills (Confirm and other primary buttons, the selected segment, the mic).
 *   Label: onPrimary. primaryPressed: the pressed fill and the shelf under primary buttons.
 * - primaryTint (+ primaryTintPressed, primaryTintBorder, onPrimaryTint, primaryTintIcon):
 *   the quick-log buttons and the parent's own chat bubbles. Light: the same as the full
 *   primary fill. Dark: a tinted dark surface with a lavender border and icon, so the big
 *   areas don't glare at night (owner's change to direction C). Full lavender in dark stays
 *   for Confirm and the active segment only.
 * - accent: highlights and marks (the Next up highlight, the night-feed bar). Never text.
 * - link: text links ("Change ›"). focus: the focused-field ring.
 * - infoBackground: the info note, the selected nav item, the age pill.
 * - success: icons only.
 * - error: the escalation border, the "Call 112" fill, danger buttons (label onPrimary).
 *   errorText: error messages and the urgent escalation title.
 * - warningBackground: the escalation card only.
 * - feed / sleep / diaper: event icons and marks (non-text).
 *   feedSoft / sleepSoft / diaperSoft: the event chip and tile fills (text on them is `text`).
 */
export const Colors = {
  light: {
    text: '#24213F',
    textSecondary: '#5A5676',
    background: '#F6F5FC',
    surface: '#ECEAF8',
    card: '#FFFFFF',
    border: '#D5D1EC',
    shelf: '#D5D1EC',
    primary: '#5146B8',
    primaryPressed: '#42399A',
    onPrimary: '#FFFFFF',
    primaryTint: '#5146B8',
    primaryTintPressed: '#42399A',
    primaryTintBorder: '#5146B8',
    onPrimaryTint: '#FFFFFF',
    primaryTintIcon: '#FFFFFF',
    accent: '#7066D8',
    link: '#4A40AE',
    focus: '#5146B8',
    infoBackground: '#E6E4FA',
    success: '#2F8A5E',
    error: '#C9304B',
    errorText: '#A8203A',
    warningBackground: '#FCE8EC',
    feed: '#B8650F',
    feedSoft: '#FCEFD9',
    sleep: '#6355CC',
    sleepSoft: '#E6E4FA',
    diaper: '#23808F',
    diaperSoft: '#DAF0F2',
  },
  dark: {
    text: '#E7E5F7',
    textSecondary: '#B4B1D3',
    background: '#191A2E',
    surface: '#232540',
    card: '#272A47',
    border: '#3C3F63',
    shelf: '#11122A',
    // Light fills with a dark label: #1B1840 on #A9A2F5 is 7.3:1.
    primary: '#A9A2F5',
    primaryPressed: '#9089E8',
    onPrimary: '#1B1840',
    // Dark-glare rule: a tinted dark surface, lavender border and icon, light label.
    primaryTint: '#2E2C5C',
    primaryTintPressed: '#3A3872',
    primaryTintBorder: '#A9A2F5',
    onPrimaryTint: '#E7E5F7',
    primaryTintIcon: '#A9A2F5',
    accent: '#A9A2F5',
    link: '#B9B3FA',
    focus: '#A9A2F5',
    infoBackground: '#2A2C52',
    success: '#7FD1A4',
    error: '#EE6A6F',
    errorText: '#FF9AAA',
    warningBackground: '#3D2230',
    feed: '#F2C179',
    feedSoft: '#3A3024',
    sleep: '#A9A2F5',
    sleepSoft: '#2C2B52',
    diaper: '#7FD3DE',
    diaperSoft: '#1F3540',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = { readonly [K in ThemeColor]: string };
