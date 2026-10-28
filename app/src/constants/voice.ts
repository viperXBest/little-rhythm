import type { RecordingConfig } from '@siteed/audio-studio';

// Muse Voice Transcribe takes WAV only, so record it directly: 16 kHz mono
// PCM16, no compressed copy. Must match supabase/functions/_shared/voice.ts.
export const VOICE_MAX_MS = 30_000;

export const VOICE_RECORDING: RecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'pcm_16bit',
  output: { primary: { enabled: true, format: 'wav' }, compressed: { enabled: false } },
  maxDurationMs: VOICE_MAX_MS,
  autoStopOnMaxDuration: true,
  keepAwake: false,
  showNotification: false,
  enableProcessing: false,
};
