// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/mic-label.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { micLabel } from './mic-label.ts';

Deno.test('idle, then "Starting…", then "Recording – speak now"', () => {
  const base = { isRecording: false, starting: false, seconds: 0, maxSeconds: 30 };
  assertEquals(micLabel(base), 'Hold to talk');
  assertEquals(micLabel({ ...base, starting: true }), 'Starting…');
  assertEquals(
    micLabel({ ...base, isRecording: true, seconds: 4 }),
    'Recording – speak now · 4s of 30s. Release to send.',
  );
  // Recording wins once the recorder runs, even before `starting` is cleared.
  assertEquals(micLabel({ ...base, isRecording: true, starting: true, seconds: 0 }).startsWith('Recording'), true);
});
