import { useAudioRecorder } from '@siteed/audio-studio';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { VOICE_MAX_MS, VOICE_RECORDING } from '@/constants/voice';
import { useTheme } from '@/hooks/use-theme';
import { micLabel } from '@/lib/mic-label';

// Shorter than this is a tap, not a message.
const MIN_CLIP_MS = 400;

type Props = {
  /** Uploads the clip. The file is deleted afterwards, whether this succeeds or not. */
  onClip: (uri: string) => Promise<void>;
  onError: (message: string | null) => void;
  disabled?: boolean;
};

async function hasMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** True when RECORD_AUDIO is already granted. Never shows the permission prompt. */
async function micAlreadyGranted(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  } catch {
    return false;
  }
}

/**
 * Dev builds only: how long the recorder took to start, and how loud the first
 * 500 ms are against the rest (dBFS). Numbers only; never audio or text.
 */
async function logClipStart(uri: string, startMs: number) {
  try {
    const bytes = await new File(uri).bytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const size = view.getUint32(offset + 4, true);
      if (id === 'data') break;
      offset += 8 + size;
    }
    const first = offset + 8;
    const samples = Math.floor((bytes.length - first) / 2);
    const head = Math.min(samples, (VOICE_RECORDING.sampleRate ?? 16000) / 2);
    const dbfs = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += view.getInt16(first + i * 2, true) ** 2;
      const rms = Math.sqrt(sum / Math.max(1, to - from));
      return rms > 0 ? Math.round(20 * Math.log10(rms / 32768)) : -Infinity;
    };
    console.log(`voice clip: start ${startMs} ms; first 500 ms ${dbfs(0, head)} dBFS, rest ${dbfs(head, samples)} dBFS`);
  } catch {
    // Diagnostics only.
  }
}

function deleteClip(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone; the recorder's cache directory is cleared by the OS too.
  }
}

/** Hold to record (up to 30 s), release to send. Clips are never kept. */
export function MicButton({ onClip, onError, disabled = false }: Props) {
  const theme = useTheme();
  const { prepareRecording, startRecording, stopRecording, isRecording, durationMs } = useAudioRecorder();
  const [starting, setStarting] = useState(false);
  // Known-granted mic permission, so a press doesn't wait on a permission check.
  const granted = useRef(false);

  /** Warms the recorder so capture starts at once on the next press. Only when already permitted. */
  async function prepare() {
    if (!granted.current) return;
    try {
      await prepareRecording(VOICE_RECORDING);
    } catch {
      // startRecording still works, just with the cold-start delay.
    }
  }

  // On opening the chat: warm up only if the permission was granted before. Never prompts.
  useEffect(() => {
    let cancelled = false;
    void micAlreadyGranted().then((ok) => {
      if (cancelled || !ok) return;
      granted.current = true;
      void prepare();
    });
    return () => {
      cancelled = true;
    };
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The clip being recorded; cleared once it has been handled, so it is sent at most once.
  const active = useRef<{ uri: string; startedAt: number; startMs: number } | null>(null);
  const released = useRef(false);

  async function finish(uri: string) {
    if (active.current?.uri !== uri) return;
    const clip = active.current;
    active.current = null;
    try {
      if (Date.now() - clip.startedAt < MIN_CLIP_MS) {
        onError('Hold the mic while you speak.');
        return;
      }
      if (__DEV__) await logClipStart(uri, clip.startMs);
      await onClip(uri);
    } finally {
      deleteClip(uri);
      void prepare();
    }
  }

  async function onPressIn() {
    if (disabled || active.current || starting) return;
    onError(null);
    released.current = false;
    const pressedAt = Date.now();
    if (!granted.current) {
      if (!(await hasMicPermission())) {
        onError('Allow microphone access to log by voice.');
        return;
      }
      granted.current = true;
    }
    // The permission dialog ends the press; hold again to record.
    if (released.current) return;
    setStarting(true);
    try {
      const { fileUri } = await startRecording({
        ...VOICE_RECORDING,
        // Fires on the 30 s cap too, while the button is still held.
        onRecordingStopped: (recording) => void finish(recording.fileUri),
      });
      active.current = { uri: fileUri, startedAt: Date.now(), startMs: Date.now() - pressedAt };
    } catch {
      onError('Could not start recording. Try again.');
    } finally {
      setStarting(false);
    }
    if (released.current) void onPressOut();
  }

  async function onPressOut() {
    released.current = true;
    const clip = active.current;
    if (!clip) return;
    try {
      await stopRecording();
    } catch {
      // Already stopped (the 30 s cap); the file is complete either way.
    }
    await finish(clip.uri);
  }

  const label = micLabel({
    isRecording,
    starting,
    seconds: Math.floor(durationMs / 1000),
    maxSeconds: VOICE_MAX_MS / 1000,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to record a voice log"
      accessibilityState={{ disabled, busy: isRecording }}
      disabled={disabled}
      onPressIn={() => void onPressIn()}
      onPressOut={() => void onPressOut()}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: isRecording ? theme.error : pressed ? theme.primaryPressed : theme.primary },
        disabled && !isRecording && styles.dimmed,
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  dimmed: { opacity: 0.6 },
});
