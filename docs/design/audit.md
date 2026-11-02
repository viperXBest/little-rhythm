# Little Rhythm UI audit (current app, Nov 2)

Source: the code in `app/src/app/**`, `app/src/components/**`, `app/src/constants/palette.ts` and
`theme.ts`. `docs/screenshots/` has only a README listing placeholder names (`home.png`, `voice-log.png`,
`escalation.png`, `checkin.png`); no images exist yet, so this audit reads the layout from the code.

## Summary: the top five problems

1. **One long, flat, centred column of identical grey cards.** `Screen` centres all content vertically
   (`justifyContent: 'center'`) in a single `ScrollView`; every block is a `surface` (#F0F2F5 / #242526)
   rectangle with radius 16 and no elevation, icon or colour coding. Home stacks 12+ blocks (name, Next
   up, quick log, check-in, night feeds, Chat button, timeline, Sign out, Delete account) with equal
   weight. Nothing says "this is the important bit" at a glance.
2. **No visual language for the three things parents log.** Feed, sleep and diaper look the same: text
   buttons, text timeline rows ("Bottle · 120 ml"), no icons, no per-type colour. At 3 a.m. the parent
   has to read every word to find the button or row they want.
3. **Typography is the system font at small sizes.** Almost every label is `small` / `smallBold` (14 sp);
   the Next up times, the most important numbers in the app, are 14 sp bold. The only large text is the
   baby's name (32 sp). No custom font (`Fonts` maps to `normal` / `system-ui`), so it reads as a generic
   Material form.
4. **Meta-blue utility palette and blue-grey dark mode.** Primary #0064E0 on white plus Facebook greys reads
   as a social/enterprise tool, not a calm baby app. Dark mode (#18191A) is neutral grey, and full-width
   #0064E0 buttons with white labels are the brightest thing on screen at night, which means glare.
5. **Destructive and rare actions sit beside daily ones.** "Sign out" and "Delete account" are full-size
   secondary buttons at the bottom of home, styled exactly like "Chat" and the diaper buttons; "Chat" (the
   headline AI feature) is a grey secondary button in the middle of the scroll. No settings screen, no
   navigation bar, no header.

Also across the app: no illustrations, empty states are a single grey sentence, and loading uses a bare
`ActivityIndicator`.

## Design system as it stands

| Area | Current | Note |
|---|---|---|
| Palette | `palette.ts`, Meta-aligned blues/greys, contrast-tested in `palette.test.ts` | Good base: all colours go through `useTheme()`, so a re-skin is mostly one file |
| Fonts | System (`Fonts.sans = 'normal'` on Android) | No custom font loaded; `expo-font` would be needed (JS + asset only, no native module beyond Expo's) |
| Type scale | `small` 14/20, `smallBold` 14/20, `default` 16/24, `subtitle` 32/44, `title` 48/52 | Big jump from 16 to 32; no 18–22 step for card headings or the key times |
| Radii | Cards 16, buttons and fields 12, timeline rows 12, segments 10, note 8 | Consistent, but every card has the same shape |
| Elevation | None | Cards are told apart only by the grey fill |
| Spacing | 4/8/16/24/32/64; screen padding 24, gap 16 | Fine |
| Icons | None (text glyphs: "✓", "⚠", "−", "+", "›") | |
| Illustration | None | |
| Theme switch | `useColorScheme()` → light/dark | Works; the navigator theme follows the palette |

## Screen by screen

### Sign in / Create account (`(auth)/sign-in.tsx`, `sign-up.tsx`)
- **Shows:** "Little Rhythm" (32 sp), a grey line, email and password `Field`s, error text, primary button,
  link to the other screen. Sign-up adds a "Check your email" state.
- **Utility feel:** a bare form vertically centred on a white page. No logo, illustration or welcome.
- **3 a.m.:** fine; fields are 16 sp with a 2 px border.
- **Accessibility:** the `Field` label is a separate `ThemedText`, not linked to the `TextInput` (no
  `accessibilityLabel` on the input), so TalkBack reads "edit box" without the label. Buttons are
  ≥ 52 dp. The link (`linkPrimary`, 14 sp, line height 30) gives a touch target of about 30 dp high, under 48.
- **States:** loading (button spinner), error (inline text) and email-sent all exist. No offline state.

### Welcome / Set up our baby / Join (`(onboarding)/*`)
- **Shows:** title, explanation, two or three stacked buttons; create-family has name and birth-date fields;
  join has the code field.
- **Utility feel:** identical layout to sign in; the first moment with the baby has no warmth at all.
- **Accessibility:** same unlabelled-input issue. "Sign out" on Welcome has the same weight as "Set up our baby".
- **States:** busy and error exist. No empty or illustration state.

### Home (`(app)/index.tsx`)
Order: baby name (32 sp) → "13 weeks old" → invite card or "You and your partner are both here." →
Next up → Quick log → Daily check-in → Night feeds → "Chat" button → Today timeline → "Sign out" →
"Delete account".
- **Utility feel:** a long settings-like list; the baby's name is a plain heading; there is no header, no
  avatar, no greeting, no colour. Because `Screen` centres content, a short page floats mid-screen.
- **3 a.m.:** the parent needs three things fast (log, what's next, is she asleep), and all three are
  14 sp text inside grey boxes. The "Start sleep" and "Feed" buttons are full-width blue bars with no icon;
  the diaper buttons are three grey bars.
- **Accessibility:** buttons ≥ 52 dp (good). Headings ("Next up", "Diaper", "Today") are not marked
  `accessibilityRole="header"`, so TalkBack users can't jump between sections. Font scaling is not capped
  or handled: at 200 % the Next up rows (`flexDirection: 'row'`, two `flex: 1` columns) wrap badly.

#### Next up card (`components/next-up.tsx`)
- **Shows:** "Next up", four rows (Next feed, Next nap or Expected to wake, Bedtime routine, Bedtime), each
  a time range in `smallBold` plus a basis line ("based on the last 7 days and age"), then the reminder
  toggle with a two-line label.
- **Utility feel:** a key–value table. The 4 px blue left border is the only accent.
- **3 a.m.:** the most important numbers in the app are 14 sp. Labels and values are equal weight; the
  basis line repeats on every row and adds noise. "overdue" is appended as plain text, not highlighted.
- **Accessibility:** each row is two separate text nodes; TalkBack reads them separately. Fine contrast.
  The `Switch` has `accessibilityLabel="Reminders"` but the long visible label isn't tied to it.
- **States:** loading (spinner + "Working out what's next…"), error (keeps the last prediction, retry when
  useful), empty ("Log a feed or sleep to see what's next."), and per-row reasons ("Asleep now" etc.). Complete.

#### Quick log (`components/quick-log.tsx`)
- **Shows:** "Start sleep" (or a sleep card "Asleep 1h 05m / Since 13:40 / Woke up"), "Feed" (opens a panel
  with Bottle/Breast segmented, Amount stepper, "Log feed now", "Cancel"), "Diaper" heading with Wet / Dirty /
  Both.
- **Utility feel:** buttons labelled with words only; sleep and feed are visually the same blue.
- **3 a.m.:** a one-tap diaper log gives no confirmation beyond the new timeline row further down the
  page, possibly off-screen. No undo.
- **Accessibility:** stepper buttons are 56×48 dp with labels "Less ml" / "More ml" (good). Segments in
  `Segmented` are about 36 dp high (`paddingVertical: 8` + 20 line height), under 48 dp. The segment
  `Pressable`s have no `accessibilityLabel` (they rely on the child text, which works) but the radiogroup
  has no label ("Bottle or breast").
- **States:** busy and save error exist; partner-conflict message exists.

#### Daily check-in (`components/checkin-card.tsx`)
- **Shows:** "How are you feeling today? (1 = rough, 5 = great)", 1–5 segmented, a free-text field, the
  privacy note, "Share"; after answering: "You · mood 4/5", the partner's answer or "Waiting for your partner…".
- **Utility feel:** a survey form. Mood is bare numbers 1–5 with no visual scale.
- **Accessibility:** mood segments are about 36 dp high and each is a 1-character label; TalkBack reads "1,
  radio button" with no meaning. The meaning lives only in the question text.
- **States:** loading, error with retry, form, answered, waiting, solo family. Complete.

#### Night feeds card (`components/night-feeds-card.tsx`)
- **Shows:** "Night feeds logged by each of you", "22:00–06:00, last 7 nights", two counts (32 sp) and an
  8 dp bar (accent vs border grey).
- **Utility feel:** fine structure; flat.
- **Accessibility:** the bar has an `accessibilityLabel` (good). The partner share is the `border` grey,
  which is decorative-contrast only (not ≥ 3:1), so the two parts of the bar are told apart mainly by the
  accent. The counts above carry the numbers, so this is acceptable.
- **States:** only shown when the predict call returns data; "Your partner's count appears once they join."

#### Today timeline (`components/timeline.tsx`)
- **Shows:** "Today", rows of time (or range) + "Bottle · 120 ml" / "Sleep · 1h 15m" / "Diaper · wet", "by
  your partner".
- **Utility feel:** a plain list; no icons or type colours, so feeds, sleeps and diapers blur together.
- **3 a.m.:** 14 sp everywhere; time and description are the same size.
- **Accessibility:** rows are `Pressable` with role button and hint "Edit or delete", but no
  `accessibilityLabel`; TalkBack reads the two texts in sequence, which works. Row height is about 36 dp
  (8 + 20 + 8), **under 48 dp**.
- **States:** loading, error with retry, empty ("Nothing logged yet today. Use the buttons above, or tell the
  chat."). Complete.

### Chat (`(app)/chat.tsx`, `components/mic-button.tsx`, `proposal-card.tsx`, `escalation-card.tsx`)
- **Shows:** "Chat", Shared/Private segmented, a long grey explanation paragraph, messages, confirm cards,
  "Little Rhythm is thinking…", the mic button, a voice privacy note, the Message field, "Send", error,
  "Back". Everything is inside one scrolling `Screen`, so the composer is not pinned to the bottom.
- **Utility feel:** no chat layout at all: the input, mic and Send sit at the end of the scroll; bubbles
  differ only by `surface` vs `background` fill (assistant bubbles are invisible on the page).
- **3 a.m.:** the mic button is the main voice entry and is a full-width blue bar with the text "Hold to
  talk". Good size (about 72 dp high) but no mic icon. While recording, the label becomes a long sentence
  ("Recording – speak now · 4s of 30s. Release to send.") in 14 sp on red.
- **Accessibility:** mic has a label and `busy` state (good). The message list is not a live region, so a
  new reply is not announced. The "✓ Saved" line uses `success` text, which the palette says is for icons
  on the page only (the glyph is decorative, the words are in `text`, so it's fine).
- **States:** threads loading/error, messages loading/error/empty, thinking, send error, mic permission
  and too-short errors. Complete.

#### Confirm card (`proposal-card.tsx`)
- **Shows:** title ("Feed", "Sleep"), optional info note "Time not mentioned, set to now. Edit if wrong.",
  `DateField`s ("Time", "Fell asleep", "Woke up" with "Still asleep" placeholder) with "Change ›", feed
  segmented + Amount stepper, "Confirm" / "Discard".
- **Utility feel:** looks like a form, not a "here's what I understood" card. The title is a 14 sp word; no
  icon tells feed from sleep.
- **Accessibility:** date fields have label + hint (good); Confirm/Discard ≥ 52 dp. Card has no
  `accessibilityRole` or label grouping, so TalkBack can't tell where one proposal ends.
- **States:** server errors per field, local validation errors, busy, saved line, discarded. Complete.

#### Escalation card (`escalation-card.tsx`)
- **Shows:** ⚠ + "I can't help with health questions" / "Please contact your paediatrician or doctor. In an
  emergency, call 112." (urgent: "This may be an emergency" / "Call 112 now." + red "Call 112" button).
- **Assessment:** correct and serious: warning fill, 2–3 px error border, ⚠, `accessibilityRole="alert"`.
  Keep it as is in every direction except font and radius. The body is 14 sp; at 3 a.m. the urgent body
  could be larger.

### Edit event (`(app)/event/[id].tsx`)
- **Shows:** "Edit" title, fields per type, "Save", "Delete", "Cancel"; "Event not found" state.
- **Utility feel:** "Delete" is a grey secondary button with no confirmation colour.
- **States:** not-found exists; busy and error exist.

### Delete account (`(app)/delete-account.tsx`)
- **Shows:** "Delete account", a grey warning card ("This can't be undone."), password field, "Delete my
  account" (a **primary blue** button) then a confirm step with the red "Yes, delete everything".
- **Utility feel:** the first destructive button is styled as the friendly primary action.

## Cross-cutting accessibility checklist

| Issue | Where | Fix in the redesign |
|---|---|---|
| Touch targets under 48 dp | `Segmented` segments (~36 dp), timeline rows (~36 dp), text links (~30 dp) | Segments and rows ≥ 48 dp; links get padding |
| Inputs not labelled | `Field` (label is a sibling text) | `accessibilityLabel={label}` on the `TextInput` |
| No header roles | Every section heading | `accessibilityRole="header"` on card titles |
| Font scaling | Row layouts in Next up, timeline (`minWidth: 96`) | Stack vertically above 1.3× font scale |
| New chat replies not announced | Chat list | Live region on the newest assistant message |
| Mood 1–5 read as bare numbers | Check-in | Per-option `accessibilityLabel` ("1, rough" … "5, great") |
| Night-feed bar partner share uses `border` | Night feeds | Fine (counts carry the data) but give the partner share a ≥ 3:1 colour |

## Baseline emulator screenshots

v1.0.0 as it ships (release APK built from `0124ed8`, which only adds react-native-svg), on the Pixel 8 emulator
(1080×2400, Android 16), signed in as the seeded demo parent Ana (Maia, 13 weeks), app locale en-GB (24 h times).
Files are in [`audit/baseline/`](audit/baseline/), each in `light`, `dark` and `font2` (font scale 2.0):

| Screen | Files |
|---|---|
| Sign-in | `sign-in-*.png` |
| Home, top to bottom in four scrolls | `home-1-*.png` … `home-4-*.png` |
| Chat (shared thread, empty) | `chat-*.png` |
| Event edit (a bottle feed) | `event-edit-*.png` |
| Delete account | `delete-account-*.png` |

What the screenshots add to the audit above:

- **12-hour locales break Next up at 200%.** With an en-US locale the ranges wrap mid-number ("12:08 PM–1 /
  2:48 PM"). The new 2×2 tiles must let a range wrap only at the en dash.
- **Sign out and Delete account sit at the bottom of home** as full-width grey buttons, the same weight as Chat.
- **Disabled Send is a pale blue fill with pale text**, hard to tell from enabled at a glance.
- **The dev client is not usable for review screenshots**: its menu, a floating Tools button and a navigation
  warning toast (from the dev client's own navigator, not the app). Review screenshots come from a release APK.
