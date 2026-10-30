import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

type FieldProps = TextInputProps & { label: string };

export function Field({ label, style, onFocus, onBlur, ...rest }: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.focus}
        cursorColor={theme.focus}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: focused ? theme.focus : theme.border,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
};

/** Fill and label per variant; every pair is in palette.test.ts. */
function buttonColors(theme: Palette, variant: ButtonVariant, pressed: boolean) {
  switch (variant) {
    case 'primary':
      return { fill: pressed ? theme.primaryPressed : theme.primary, label: theme.onPrimary };
    case 'danger':
      return { fill: theme.error, label: theme.onPrimary };
    case 'secondary':
      return { fill: pressed ? theme.border : theme.surface, label: theme.text };
  }
}

export function Button({ title, onPress, variant = 'primary', busy = false, disabled = false }: ButtonProps) {
  const theme = useTheme();
  const inactive = busy || disabled;
  const { label } = buttonColors(theme, variant, false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: buttonColors(theme, variant, pressed).fill },
        variant === 'danger' && pressed && styles.pressed,
        inactive && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={label} />
      ) : (
        <ThemedText style={{ color: label }} type="smallBold">
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  const theme = useTheme();
  if (!children) return null;
  return (
    <ThemedText accessibilityLiveRegion="polite" type="small" style={{ color: theme.errorText }}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  field: { gap: Spacing.one },
  input: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.6 },
});
