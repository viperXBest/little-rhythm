# Little Rhythm v1.2.1

Android APK, sideloaded. Built for the Meta Global AI Developer Hackathon (Indie
Developer track). A one-fix release on top of v1.2.0: the quick-log buttons keep their
layout after a feed is logged.

## Download

| File | Version | SHA-256 |
|---|---|---|
| `little-rhythm-1.2.1.apk` | 1.2.1 (versionCode 8) | `4a918894c2eab28940267a5c088f3e036b759ee7162af0ef4056f1ca1ce7188e` |

- Built by EAS (build `a4e47684-0e33-4c5d-8fa6-4af8141527bd`, production profile).
- **Installing over v1.2.0 or v1.1.1:** updating from an EAS APK works without uninstalling.
  Uninstall first if you have v1.0.0 or a local build, because the signature differs.
- Check the file: `sha256sum little-rhythm-1.2.1.apk` (Windows:
  `certutil -hashfile little-rhythm-1.2.1.apk SHA256`).

## Fix

**Start sleep and Feed keep their layout after a feed.** On v1.2.0, after a feed was logged
from the Feed panel (or the panel was cancelled, or a sleep ended), the two big buttons could
lose their side-by-side layout: Start sleep became a narrow, tall tile with only the moon
icon, and Feed ran off the right edge of the screen.

- **Cause:** the two buttons switch between a row and a stack (an open Feed panel, an open
  sleep or a large font stacks them). The same layout-only views were reused across the
  switch, and on Android they kept the frames of the previous layout. The layout itself was
  computed correctly.
- **Fix:** the two-button block is rebuilt when the layout switches. No save can be lost:
  saves run outside the rebuilt views, and the Feed panel is open only while the buttons are
  already stacked.
- Checked on the emulator in light and dark mode at font scale 1.0 and 2.0: logging a feed,
  cancelling the Feed panel, starting and ending a sleep, Add a past sleep and Diaper →
  Earlier…. No change to behaviour or copy.

## Server

No hosted change. The app talks to the same server as v1.2.0: `chat` v11, `predict` v5,
`pair` v4, `delete-account` v2, latest migration `20261103140000`
([deployed versions](https://github.com/viperXBest/little-rhythm/blob/main/docs/security.md#deployed-versions)).
Everything in the [v1.2.0 notes](https://github.com/viperXBest/little-rhythm/blob/main/docs/release-notes-v1.2.0.md)
(manual entry, growth, trends, the classifier context) still applies.

## Known limits

Unchanged from v1.2.0; see its notes and the README's
[Known limitations](https://github.com/viperXBest/little-rhythm/blob/main/README.md#known-limitations).

**Not medical advice.** Health questions get only a static card pointing to the
paediatrician or the emergency number. Growth and trends are records, never advice.
