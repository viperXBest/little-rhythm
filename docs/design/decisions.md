# Design decisions (v1.1.0)

The redesign ships as v1.1.0. It changes the UI layer only: no change to data, RLS, Edge Functions,
security or behaviour, and copy stays as it is. The separate server track (rate caps, `max_tokens`,
prompt rule, jailbreak set) is recorded in [`../security-review-2026-11-02.md`](../security-review-2026-11-02.md).

## Timeline

| When | What |
|---|---|
| Nov 2, 13:00 | Three directions ready (done 08:55) |
| Nov 2 | Direction picked: C |
| Nov 3, 18:00 | Design freeze |
| Nov 3, evening | v1.1.0 EAS build and checks on both phones |

## Direction: C, Cloud Lullaby (picked Nov 2)

Spec and mockups: [`directions/c-cloud-lullaby/`](directions/c-cloud-lullaby/README.md). The audit is in
[`audit.md`](audit.md) and the comparison in [`directions/README.md`](directions/README.md).

**Why C over the recommended B:** the brief asks for friendly and playful, and B is the least playful of
the three. C's escalation card separates well from the indigo UI (indigo against red), which covers the
main reason given for B.

### Changes to C before Phase 2 (owner, Nov 2)

1. **Dark-mode glare.** In dark mode the quick-log buttons and the parent's own chat bubbles use a tinted
   dark surface with a lavender (`primary`) border and icon, not a full lavender fill. Only the Confirm
   button and the active segment keep the full lavender fill. Light mode is unchanged.
2. **Body font: Nunito instead of Atkinson Hyperlegible.** Atkinson's slashed zero makes "21:00" and
   "90 ml" read as "21:ØØ" and "9Ø ml". Baloo 2 stays for headings and big times. Both fonts are OFL 1.1.
   The contrast and 200% font-scale checks are re-run with Nunito.
3. **Next up highlights the tile with the earliest start** (in the mockup that is the nap at 15:07, not
   the feed). The 2×2 layout stays.
4. **Home scroll bottom padding** equals the floating Chat button's height plus spacing, so the button
   never covers the last timeline row.

### Rules that hold for every screen

- Colours only from `app/src/constants/palette.ts` through `useTheme()`, never as literals.
  `palette.test.ts` checks every pair the app uses (text ≥ 4.5:1; large text, icons, focus rings,
  accents and UI boundaries ≥ 3:1). The pinned Meta-blue test is replaced by tests for this palette.
- **Escalation card stays serious:** `warningBackground` fill, `error` border, ⚠ mark, red "Call 112"
  button, exact existing text. No mascot, illustration or playful styling. It may use the direction's
  fonts and radius only.
- Illustrations are react-native-svg components whose fills come from theme tokens: one file per asset,
  no light/dark copies. No `SvgUri`, `SvgCssUri`, `SvgFromUri`, `LocalSvg` or remote `href`s (enforced by
  ESLint).
- Accessibility: 48 dp touch targets, text that scales to 200% without clipping, labels and roles on
  every control, header roles on section titles.
- Every screen has its empty, loading and error states.
- Nothing copied from Huckleberry or any other app; all assets are original.

## Fonts

| Family | Use | Licence | Source |
|---|---|---|---|
| Baloo 2 | Headings, baby name, big times, button labels | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/baloo2 |
| Nunito | Body, labels, captions, chat text | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/nunito |

The licence texts ship next to the font files in the app (`app/assets/fonts/`).

## Phase 2 order

Home → chat and confirm cards → couple (check-in, reveal, night-feed balance) → timeline and edit →
auth, onboarding, pairing, settings, delete-account. The demo covers the first three. If time runs
short, the last group gets the new tokens and fonts only.

## Native changes

- `react-native-svg` 15.16.0, added before the first local dev-client build (commit `0124ed8`).
- Fonts load through `expo-font`, which was already in the app.
- The app icon, adaptive icon, splash and notification icon change native config, so they reach the
  phones only through a new build (local release APK for checkpoints, the EAS build on Nov 3 for v1.1.0).

## Log

Later decisions go below, newest last.

### Nov 2: foundation (design system, `docs/design/system.md`)

- **Dark-glare tokens:** `primaryTint`, `primaryTintPressed`, `primaryTintBorder`, `onPrimaryTint`,
  `primaryTintIcon`. In light they equal `primary` / `primaryPressed` / `onPrimary`; in dark `#2E2C5C`,
  `#3A3872`, `#A9A2F5`, `#E7E5F7`, `#A9A2F5`. Used by quick-log buttons and the parent's chat bubbles
  (`Button variant="tint"`). Full lavender fill stays for Confirm and the active segment only.
- **`shelf` token** (`#D5D1EC` / `#11122A`). The sticker shelf is an offset backing view, not Android
  `elevation` (which can only blur). Pressed buttons sink 4 px onto their shelf.
- **Danger buttons are flat** (no shelf), so "Call 112" never looks playful.
- **Bundled weights:** Baloo 2 600/700/800, Nunito 400/600/700/800 (`@expo-google-fonts/*` subpath
  imports, loaded with `useFonts` behind the splash; on a load error the app falls back to the system
  font). Licences: `app/assets/fonts/LICENSES.md`.
- **Type:** body 17/25; small 15 (labels only). No text relies on the large-text contrast threshold.
- **Escalation card:** type moved from small to default/defaultBold (17 px) and radius from 16 to 14;
  fill, border, ⚠, flat red "Call 112" and text unchanged.
- **ESLint** bans `SvgUri`, `SvgCssUri`, `SvgFromUri`, `LocalSvg`, `SvgCss`, `WithLocalSvg`,
  `react-native-svg/css` and `href`/`xlinkHref` values starting with `http(s):` or `//`.

### Nov 2: illustrations and native assets (`docs/design/illustrations.md`)

- Components: `Mascot` (poses `sleeping`, `awake`, `waiting`, `cosy`), `Illustration` (`emptyTimeline`,
  `emptyChat`, `checkinWaiting`, `invitePartner`, `error` — calm, no mascot) and `Icon` (25 duotone icons).
  All geometry is in `art-data.ts`, shared by the app and the Deno contact-sheet script, so the sheet shows
  exactly what ships.
- The escalation `warning` icon is a plain `error` outline with no duotone fill.
- The settings icon is two sliders, not a gear (a gear doesn't read at 20 dp). The wake icon uses `sleep`.
- **Native:** splash background, adaptive-icon background and notification colour are `primary`
  `#5146B8`. The app icon is Fluff with a `primaryPressed` drop shadow. `scripts/assets/render.ts`
  (headless Chrome) renders every PNG from the masters in `app/assets/source/` and replaces
  `notification-icon.ts`; it fails if the notification or monochrome icon has any non-white pixel.
- The notification icon (Fluff's silhouette) reads mostly as a cloud at 24 dp: check it in a real status
  bar on the release APK.

### Nov 2: home and settings (orchestrator)

- **Sign out and Delete account leave home** for a new Settings screen, opened from a gear button in the
  home header. Same buttons, same behaviour, one tap further away from daily actions.
- **Chat entry:** a floating "Chat" button with the mic icon, bottom right of home, per the mockup; the
  home scroll's bottom padding equals its height plus spacing.
- **Screen builders preview chat on hosted** with at most 6 messages in the demo's private thread, cancel
  every confirm card, and the demo family is re-seeded afterwards so the recording starts clean.
