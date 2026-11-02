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

import { Shelf } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  font,
  MaxContentWidth,
  MinTouch,
  Radius,
  Spacing,
  Sticker,
  TypeScale,
  type Palette,
  type ThemeColor,
} from '@/constants/theme';
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

type FieldProps = TextInputProps & {
  /** Visible label; also the input's accessibilityLabel unless one is passed. */
  label: string;
  /** Error message shown under the field (errorText colour). */
  error?: string | null;
  /** Short helper line under the field. */
  hint?: string;
};

export function Field({ label, error, hint, style, onFocus, onBlur, ...rest }: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const outline: ThemeColor = focused ? 'focus' : error ? 'error' : 'border';
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" importantForAccessibility="no">
        {label}
      </ThemedText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
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
          font('body', 400),
          { color: theme.text, backgroundColor: theme.surface, borderColor: theme[outline] },
          style,
        ]}
        {...rest}
      />
      {hint ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      <ErrorText>{error ?? null}</ErrorText>
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet' | 'tint';

type ButtonProps = {
  title: string;
  onPress: () => void;
  /**
   * primary: full primary fill (Confirm, main actions). secondary: surface + outline.
   * danger: error fill, flat (no shelf: "Call 112" must not look playful). quiet: a text
   * button in the link colour. tint: the dark-glare fill (quick-log style; primary in light).
   */
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  /** Decorative icon before the label (hide it from screen readers). */
  icon?: ReactNode;
  /** large: quick-log size (64 dp, bigger label). */
  size?: 'default' | 'large';
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type ButtonLook = {
  fill: ThemeColor | null;
  pressedFill: ThemeColor | null;
  label: ThemeColor;
  outline: ThemeColor | null;
  shelf: ThemeColor | null;
};

/** Fill, label, outline and shelf per variant; every text pair is in palette.test.ts. */
const LOOKS: Record<ButtonVariant, ButtonLook> = {
  primary: { fill: 'primary', pressedFill: 'primaryPressed', label: 'onPrimary', outline: null, shelf: 'primaryPressed' },
  secondary: { fill: 'surface', pressedFill: 'border', label: 'text', outline: 'border', shelf: 'shelf' },
  danger: { fill: 'error', pressedFill: 'error', label: 'onPrimary', outline: null, shelf: null },
  quiet: { fill: null, pressedFill: 'surface', label: 'link', outline: null, shelf: null },
  tint: {
    fill: 'primaryTint',
    pressedFill: 'primaryTintPressed',
    label: 'onPrimaryTint',
    outline: 'primaryTintBorder',
    shelf: 'primaryTintPressed',
  },
};

/**
 * Disabled primary and tint buttons: a muted surface look in both themes, so an unavailable action is
 * never a big lavender block in dark. Same shelf height as the enabled look, so nothing moves.
 */
const DISABLED_LOOK: ButtonLook = {
  fill: 'surface',
  pressedFill: 'surface',
  label: 'textSecondary',
  outline: 'border',
  shelf: 'border',
};

export function buttonLabelColor(theme: Palette, variant: ButtonVariant): string {
  return theme[LOOKS[variant].label];
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  icon,
  size = 'default',
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = busy || disabled;
  const muted = disabled && !busy && (variant === 'primary' || variant === 'tint');
  const look = muted ? DISABLED_LOOK : LOOKS[variant];
  const label = theme[look.label];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={inactive && !muted && styles.dimmed}>
      {({ pressed }) => {
        const fill = pressed ? look.pressedFill : look.fill;
        return (
          <Shelf
            radius={Radius.button}
            shelf={look.shelf}
            sunk={pressed && !inactive}
            faceStyle={[
              styles.button,
              size === 'large' && styles.large,
              {
                backgroundColor: fill ? theme[fill] : 'transparent',
                borderColor: look.outline ? theme[look.outline] : 'transparent',
                borderWidth: look.outline ? Sticker.outline : 0,
              },
              variant === 'danger' && pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={label} />
            ) : (
              <>
                {icon ? (
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {icon}
                  </View>
                ) : null}
                <ThemedText
                  type={size === 'large' ? 'buttonLarge' : 'button'}
                  style={[styles.label, { color: label }]}>
                  {title}
                </ThemedText>
              </>
            )}
          </Shelf>
        );
      }}
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
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 54,
    fontSize: TypeScale.default.fontSize,
  },
  button: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MinTouch + Spacing.one,
  },
  large: { minHeight: 64 },
  label: { textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.6 },
});
