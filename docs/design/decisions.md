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
   never covers the last timeline row. *Superseded on Nov 2:* the padding cleared only the last row,
   so the floating button still covered Diaper "Dirty" and "Both" until you scrolled
   (`screens/home/home-1-light.png`, taken before the fix). The button is now docked in a bar below
   the scroll (`8db6e70`, see "Nov 2: owner's fixes after the checkpoint").

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
- **Next up highlight** = earliest start among the displayed windows, even if already overdue; ties go
  to the first slot. It gets a 2 px `primary` outline and a `primaryPressed` shelf; other tiles keep the
  4 px space so rows line up. TalkBack reads ", earliest" on it (not visible text). Pure helper
  `app/src/lib/earliest.ts`, Deno-tested.
- **Ranges** are two text pieces, so they wrap only after the en dash; the grid drops to one column when
  a tile can't fit half a range at the current font scale.
- **Font-scale breakpoints:** the header stacks at ≥ 1.5, the quick-log buttons stack at ≥ 1.6.
- **Reminder switch:** off = `textSecondary` thumb on a `border` track; on = `onPrimary` on `primary`.
- The Chat button's outline and shelf use `text`, as in the mockup. Delete account uses the flat
  `danger` variant, separated from Sign out by a divider.
- **Timeline rows:** `card` fill, radius `Radius.button`, a shelf, ≥ 64 dp, the whole row is the button.
  An ongoing sleep gets a `sleepSoft` fill and a `sleep` outline. At font scale ≥ 1.5 the time moves
  under the title. Pure helper `app/src/lib/timeline-display.ts`, Deno-tested.
- **Event edit:** fields grouped in a `Card`; Save primary, Delete the flat danger button with the delete
  icon (the existing confirmation stays), Cancel quiet. The diaper kind stays a `Segmented` control.
- **Chat:** pinned header (round Back, title, Shared/Private) and pinned composer in two rows (field +
  Send, then "Hold to talk" with the 64 dp mic at the bottom right). Own bubbles `primaryTint` +
  `primaryTintBorder`; partner messages an outlined `card` without a shelf; replies `Card` stickers; the
  newest reply is a polite live region. The visible "Message" label above the field is gone (TalkBack
  still reads it). The Muse privacy note is a caption at the end of every thread. The empty-chat
  illustration shows only when a thread has no messages, so it never sits beside an escalation card.
- **Confirm cards:** the time field puts its label above the value with "Change ›" on the right, so it
  fits at 100% and 200%. Feed fields share a row only when both fit (basis 200 dp). Confirm primary,
  Discard secondary.
- **Mic:** recording = `error` fill with the stop icon and a slight scale-up; announced once.
- **Check-in:** mood is five 56 dp round radio buttons in a radiogroup labelled by the question;
  TalkBack reads "1 of 5, rough" … "5 of 5, great" (ends taken from the question text). Waiting shows
  your answer above the `checkinWaiting` illustration. **The reveal** is two outlined tiles, "You" and
  "Your partner", fading in 160 ms apart (no motion with reduced motion on), stacking at large font scales.
- **Night-feed balance:** counts in `display` type with colour dots; the bar is your share in `accent`,
  a 2 dp gap, your partner's share in `feed` (marigold; `sleep` was rejected as the same indigo as
  `accent`). TalkBack hears one summary of the period and both counts.
- **Account screens** share `app/src/components/account-ui.tsx` (`Hero`, `TextLink`, `BackHeader`,
  `FormScreen`). Sign-in and sign-up show Fluff waving; delete-account has no mascot, a flat explanation
  card, and every destructive button is flat danger ("Delete my account" was primary). Sign out on
  Welcome is a quiet button. Settings groups are Cards with no new headings (copy is frozen).
- **Codes** (join field, invite card) use Baloo 2 with letter spacing instead of monospace: the code
  alphabet has no 0/O or 1/I. The invite code stays on one line and selectable.
- **Screen builders preview chat on hosted** with at most 6 messages in the demo's private thread, cancel
  every confirm card, and the demo family is re-seeded afterwards so the recording starts clean.

### Nov 2: independent review and fix round

An independent reviewer (no access to the builders' reports) checked tokens, contrast, touch targets,
200% text, screen-reader semantics, dark mode, the escalation card and regressions against v1.0.0. It
found no colour literals, no copy or logic changes, the escalation card intact, and one major bug: at
font scale ≥ 1.6 the diaper tiles overlapped the check-in card. Fixed in the fix round with:

- **Glare rule, as applied (orchestrator; owner may override):** in dark, persistent chrome uses the
  tint look: the chat mic (idle), the Chat button's mic square and Send. The Chat button's outline and
  shelf use `primaryTintBorder` / `shelf` in dark. Single form-completing actions (Confirm, Save, Log
  feed now, Set up our baby, Show pairing code, Share) and the selected mood or active segment keep the
  full fill. Disabled primary buttons are muted (no lavender block) in both themes.
- **Event edit order:** Save, Cancel, then extra space and Delete, so the two fills aren't stacked.
- Reminder switch: the whole row is the 48 dp control. "Diaper" gets a header role. The ESLint SVG ban
  also covers `href={{ uri: 'http…' }}`. Every colour pair the code uses is now in `palette.test.ts`.
- **Keyboard:** the shared `Screen` resizes for the keyboard on edge-to-edge Android.
- **Accessibility text** changed in three places without visible copy changes (night-feed summary,
  timeline row order "title, time", Next up tiles as one stop with ", earliest"): accepted as
  improvements; visible copy stays frozen.
- Fix-round details: disabled primary and tint buttons use a `surface` fill, `border` outline and shelf
  and a `textSecondary` label (no opacity), still announced as disabled. `FormScreen` is folded into the
  shared `Screen` (KeyboardAvoidingView 'height' on Android, `top` prop). The reminder row is the switch:
  label "Reminders", the visible sentence as its hint. A wrapped "overdue" drops its "·" and sits on its
  own line. Titles and basis lines use balanced line breaks. In light, the mic's outline is `primary`.

### Nov 2: owner's answers on the status page

- **Confirmed:** the dark-glare rule as applied, and Sign out / Delete account on the Settings screen.
- **Phone checkpoint replaced** by two emulators (Ana and Radu) for sync, the check-in reveal, the
  night-feed balance, Settings, icon/splash/notification icon, the full keyboard, TalkBack, the mic
  states and en-US/en-GB at font scale 1.0 and 2.0. Real voice and the hardware feel are checked on the
  phones with the v1.1.0 EAS build.
- **Server track moved** to the `server-track` branch with a revert on `main` (`acde973`, no history
  rewrite). `main` and `server-track` pushed; CI green on both.
- **Paired control** (urgent and non-health sets, v8 and the server track at the same time on the local
  stack): urgent agreement v8 71/73, server track 70/72, every prompt escalated, same misses. The cause
  is the API, not the server track. Proposed fix, pending the owner: raise the classifier timeout from
  10 s to the agent's 30 s (they run in parallel, so a typical turn gets no slower). The non-health half
  returned 401s because the runner's test tokens expire after an hour; it needs a token refresh before a
  rerun.

### Nov 2: two-emulator checkpoint

All ten items passed with no code changes (screenshots: `docs/design/screens/checkpoint/`): realtime
quick-log sync both ways within 4 s, the check-in reveal on both sides, the mirrored night-feed balance,
Settings in one tap, launcher icon and splash, the nap reminder firing 10 min ahead, the full Gboard on
sign-in and the chat composer at 1.0 and 2.0 (event edit has no text field), TalkBack labels and roles
from the accessibility tree (adb can't drive TalkBack gestures), "Recording – speak now" ("Starting…"
lasts under 0.4 s, too short to capture), and en-US / en-GB at 1.0 and 2.0 wrapping only at the dash.

Open for the owner:
- **Notification icon** reads as an eye in the status bar (Fluff's silhouette with the face cut out).
  Proposed: a solid cloud silhouette with no cut-outs. Native asset, so it rides along in the v1.1.0 EAS
  build at no extra build.
- **The floating Chat button covers the Dirty and Both diaper tiles** at the top of home until you scroll.
  The bottom padding only clears the last row.
- At font scale 1.0 the keyboard covers part of Sign in (still tappable); at 2.0 the button needs one
  scroll. "Breast · right · 14 / min" orphans "min" at 2.0.

### Nov 2: owner's fixes after the checkpoint

- **Chat button docked** in a bar below the home scroll (page background, `border` top edge, safe-area
  bottom inset). The scroll takes the remaining height by flex layout, so the button can't cover
  anything at any screen size or font scale (checked on both emulators at 1.0 and 2.0).
- **Notification icon** is a solid white cloud with no face or cut-outs (reached a device only with
  the next native build).
- **Keyboard:** the shared `Screen` pads by the keyboard height on `keyboardDidShow` and scrolls to the
  end, so Sign in is fully visible above the keyboard at 1.0 and 2.0 (sign-up too).
- **Non-breaking spaces** between numbers and units ("14 min", "90 ml", "13 weeks", "30 seconds"),
  through `app/src/lib/units.ts` (Deno-tested). Copy is otherwise identical.
- **Classifier timeout** raised to 30 s on `server-track` (`3a83a53`, with a runner token refresh) and
  merged into `main` for the full safety rerun. The rerun is blocked: Windows denies access to the
  Supabase CLI binary in the npx cache since 16:40 (likely endpoint protection). Pending the owner.
