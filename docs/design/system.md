# Design system (v1.1.0, Cloud Lullaby)

How to build a screen from the tokens and primitives. The spec is
[`directions/c-cloud-lullaby/`](directions/c-cloud-lullaby/README.md); the owner's changes are in
[`decisions.md`](decisions.md). Screenshots of the foundation: [`screens/system/`](screens/system/).

## Rules

- Colours only from `useTheme()` (`app/src/hooks/use-theme.ts`), never literals. Add a token to
  `app/src/constants/palette.ts` and its pair to `palette.test.ts` before using a new combination.
- Text only through `<ThemedText type="...">`. It picks the font family per weight (Android can't pick a
  weight of a custom font from `fontWeight`); a `fontWeight` in `style` maps to the nearest bundled weight.
- Touch targets ≥ 48 dp (`MinTouch`), no fixed heights on text containers (text scales to 200%), roles and
  labels on every control, `accessibilityRole="header"` on section titles, decorative art hidden.
- **Dark-glare rule:** large lavender areas glare at night. Quick-log buttons and the parent's own chat
  bubbles use the `primaryTint*` tokens (light: the full primary fill; dark: a tinted navy with a lavender
  border and icon). Only Confirm (and other single primary actions) and the active segment use the full
  `primary` fill in dark.
- **Escalation card stays serious:** `warningBackground`, `error` border (3 px urgent), ⚠ in `errorText`,
  flat red "Call 112" (`Button variant="danger"`, which has no shelf), radius `Radius.field`. Never a `Card`,
  shelf, mascot or illustration.

## Tokens (`palette.ts`)

| Token | Light | Dark | Role |
|---|---|---|---|
| text | `#24213F` | `#E7E5F7` | Body text |
| textSecondary | `#5A5676` | `#B4B1D3` | Secondary text, basis lines, meta |
| background | `#F6F5FC` | `#191A2E` | Page |
| surface | `#ECEAF8` | `#232540` | Fields, segment track, secondary buttons, stepper buttons |
| card | `#FFFFFF` | `#272A47` | Sticker cards, assistant bubbles |
| border | `#D5D1EC` | `#3C3F63` | Decorative dividers, 2 px sticker outline |
| shelf | `#D5D1EC` | `#11122A` | Hard 4 px shelf under cards and secondary buttons. Never text |
| primary | `#5146B8` | `#A9A2F5` | Full fills: Confirm/primary buttons, active segment, mic, selected chip |
| primaryPressed | `#42399A` | `#9089E8` | Pressed fill; shelf under primary buttons |
| onPrimary | `#FFFFFF` | `#1B1840` | Label on `primary`, `primaryPressed`, `error` |
| primaryTint | `#5146B8` | `#2E2C5C` | Quick-log buttons, own chat bubbles (dark-glare rule) |
| primaryTintPressed | `#42399A` | `#3A3872` | Pressed tint; its shelf |
| primaryTintBorder | `#5146B8` | `#A9A2F5` | 2 px outline of the tint fill |
| onPrimaryTint | `#FFFFFF` | `#E7E5F7` | Label/text on the tint (bubble text and meta too, no opacity) |
| primaryTintIcon | `#FFFFFF` | `#A9A2F5` | Icon stroke on the tint |
| accent | `#7066D8` | `#A9A2F5` | Highlights (Next up earliest tile, night-feed bar). Never text |
| link | `#4A40AE` | `#B9B3FA` | Text links ("Change ›"), quiet buttons |
| focus | `#5146B8` | `#A9A2F5` | Focused-field ring, spinners |
| infoBackground | `#E6E4FA` | `#2A2C52` | Info note, age pill, selected nav item |
| success | `#2F8A5E` | `#7FD1A4` | Icons only |
| error | `#C9304B` | `#EE6A6F` | Escalation border, "Call 112", danger buttons, field error outline |
| errorText | `#A8203A` | `#FF9AAA` | Error messages, urgent escalation title, ⚠ |
| warningBackground | `#FCE8EC` | `#3D2230` | Escalation card only |
| feed / feedSoft | `#B8650F` / `#FCEFD9` | `#F2C179` / `#3A3024` | Feed icon and marks / feed tile and chip fill |
| sleep / sleepSoft | `#6355CC` / `#E6E4FA` | `#A9A2F5` / `#2C2B52` | Sleep icon and marks / sleep tile and chip fill |
| diaper / diaperSoft | `#23808F` / `#DAF0F2` | `#7FD3DE` / `#1F3540` | Diaper icon and marks / diaper chip fill |

Event colours (`feed`, `sleep`, `diaper`) are for icons and marks only; text on the soft fills is `text`
or `textSecondary`.

## Type (`theme.ts` `TypeScale`, `<ThemedText type>`)

Baloo 2 (`heading`) and Nunito (`body`), OFL 1.1 (`app/assets/fonts/LICENSES.md`). Bundled weights:
Baloo 2 600/700/800, Nunito 400/600/700/800.

| type | Font | Size / line | Use |
|---|---|---|---|
| `display` | Baloo 2 800 | 46 / 56 | Baby name |
| `title` | Baloo 2 700 | 30 / 40 | Screen title |
| `subtitle` | Baloo 2 700 | 24 / 32 | Section and screen headings (v1.0 callers) |
| `cardTitle` | Baloo 2 700 | 21 / 28 | Card titles |
| `time` | Baloo 2 700 | 23 / 30 | Big Next up times, stepper value |
| `buttonLarge` | Baloo 2 700 | 19 / 26 | Quick-log labels |
| `button` | Baloo 2 700 | 17 / 24 | Button labels |
| `default` | Nunito 400 | 17 / 25 | Body, chat text |
| `defaultBold` | Nunito 700 | 17 / 25 | Emphasised body (escalation title) |
| `small` | Nunito 600 | 15 / 22 | Labels, short secondary lines |
| `smallBold` | Nunito 700 | 15 / 22 | Field labels, segment labels, chip labels |
| `caption` | Nunito 700 | 13 / 18 | Basis lines, bubble meta, field hints |
| `link`, `linkPrimary` | Nunito 700 | 15 / 22 | Links (`linkPrimary` is always `link` colour) |
| `code` | system mono | 12 | Codes (callers set their own size) |

For a raw `TextInput`, spread `font('body', 400)` from `theme.ts`. If the fonts fail to load, the app runs
on the system font with real weights (`setCustomFontsAvailable`).

## Spacing, radii, elevation

- `Spacing`: half 2, one 4, two 8, three 16, four 24, five 32, six 64. Screen padding `four`, card padding
  `three`, gaps `two`–`three`.
- `Radius`: small 12 (chips, tiles), field 14 (fields, segment track, escalation), button 16 (buttons, rows),
  bubble 20, fab 20, card 22, pill 999.
- **Sticker elevation** (`Sticker`: outline 2, shelf 4): a 2 px `border` outline plus a hard shelf drawn as an
  offset backing view (`Shelf` in `components/card.tsx`), no blur and no Android `elevation`. Pressed
  buttons sink 4 px onto their shelf. Shelf colours: `shelf` (cards, secondary), `primaryPressed` (primary),
  `primaryTintPressed` (tint). Flat: danger, quiet, the escalation card.

## Primitives

| Component | File | Notes |
|---|---|---|
| `Card` | `components/card.tsx` | Sticker card. Props: `tone` (fill token, default `card`; e.g. `feedSoft`), `outline`, `raised` (shelf, default true), `padding`, `radius`, plus View props. `style` goes to the face. |
| `Shelf` | `components/card.tsx` | The raw shelf for custom pressables (`radius`, `shelf` token or null, `sunk`). |
| `Button` | `components/form.tsx` | `variant`: `primary`, `secondary`, `danger` (flat), `quiet` (link text), `tint` (dark-glare quick-log look). `size="large"` = 64 dp quick-log. `icon` (decorative node), `busy`, `disabled`, `accessibilityLabel/Hint`. Min 52 dp. |
| `Field` | `components/form.tsx` | Visible label = `accessibilityLabel` (override by passing one). `error` (red outline + message), `hint`. Focus ring `focus`. |
| `ErrorText`, `Screen` | `components/form.tsx` | Unchanged API. |
| `Segmented` | `components/controls.tsx` | Track `surface` + outline, active `primary`. 48 dp. Optional `accessibilityLabel` for the group. |
| `Stepper` | `components/controls.tsx` | Unchanged API; outlined surface buttons, value in `time`. |
| `Chip` | `components/controls.tsx` | `label`, `tone` (`neutral`/`feed`/`sleep`/`diaper`/`info`), `selected` (primary fill), `onPress` (omit for a static pill), `icon`. 48 dp when tappable. |
| `Loading`, `Empty`, `ErrorState` | `components/states.tsx` | Existing APIs plus `illustration` (decorative ReactNode, hidden from TalkBack); `Empty` also takes `title` and `action`. No mascot in `ErrorState`. |

## Contrast pairs (`palette.test.ts`)

Every pair passes in both themes (113 tests). Text ≥ 4.5:1: `text` and `textSecondary` on background,
surface, card, infoBackground, warningBackground and the three soft fills (`text` on `border` too); `link` on
background, surface, card; `onPrimary` on primary, primaryPressed, error; `onPrimaryTint` on primaryTint and
primaryTintPressed; `errorText` on background, surface, card, warningBackground. Large-text 3:1: none (no
text relies on it). Non-text ≥ 3:1: focus, accent on background/surface/card; success, error, primary,
primaryTintBorder on background/card; error on warningBackground; primaryTintIcon on the tint fills; each
event colour on background, card and its soft fill.

New dark-glare pairs (light / dark): `onPrimaryTint` on `primaryTint` 7.20 / 10.39, on `primaryTintPressed`
9.20 / 8.52; `primaryTintIcon` on `primaryTint` 7.20 / 5.62; `primaryTintBorder` on background 6.64 / 7.47,
on card 7.20 / 6.08. The palette values for the C tokens are pinned in the test.

## SVG safety

ESLint (`app/eslint.config.js`) bans importing `SvgUri`, `SvgCssUri`, `SvgFromUri`, `LocalSvg`, `SvgCss`,
`WithLocalSvg` and `react-native-svg/css`, and any JSX `href`/`xlinkHref` whose string starts with `http(s):`
or `//`. Local `#id` references are fine.
