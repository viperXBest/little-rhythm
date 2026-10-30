// The mic button's label. No imports: this runs under the app and under
// `deno test` (mic-label.test.ts).

/**
 * Speak once it says "speak now": words said while the recorder starts up are
 * not captured, so "Starting…" shows until it really records.
 */
export function micLabel(state: {
  isRecording: boolean;
  starting: boolean;
  seconds: number;
  maxSeconds: number;
}): string {
  if (state.isRecording) {
    return `Recording – speak now · ${state.seconds}s of ${state.maxSeconds}s. Release to send.`;
  }
  return state.starting ? 'Starting…' : 'Hold to talk';
}
