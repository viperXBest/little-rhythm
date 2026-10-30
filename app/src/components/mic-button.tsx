import { useAudioRecorder } from '@siteed/audio-studio';
import { File } from 'expo-file-system';
import { useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { VOICE_MAX_MS, VOICE_RECORDING } from '@/constants/voice';
import { useTheme } from '@/hooks/use-theme';

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
  const { startRecording, stopRecording, isRecording, durationMs } = useAudioRecorder();
  const [starting, setStarting] = useState(false);
  // The clip being recorded; cleared once it has been handled, so it is sent at most once.
  const active = useRef<{ uri: string; startedAt: number } | null>(null);
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
      await onClip(uri);
    } finally {
      deleteClip(uri);
    }
  }

  async function onPressIn() {
    if (disabled || active.current || starting) return;
    onError(null);
    released.current = false;
    if (!(await hasMicPermission())) {
      onError('Allow microphone access to log by voice.');
      return;
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
      active.current = { uri: fileUri, startedAt: Date.now() };
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

  const seconds = Math.floor(durationMs / 1000);
  const label = isRecording
    ? `Recording… ${seconds}s of ${VOICE_MAX_MS / 1000}s. Release to send.`
    : 'Hold to talk';

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
