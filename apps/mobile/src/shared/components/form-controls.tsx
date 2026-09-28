import { useState, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './primitives';

/**
 * A labelled field and the input inside it.
 *
 * The label sits above the input and stays there — a placeholder that doubles as a label
 * disappears the moment somebody types, taking the question with it. The border says what
 * state the field is in: resting, focused (the brand colour), or wrong (the danger colour).
 */

export function Field({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  /** A problem with what was typed. Shown in place of the hint. */
  error?: string | null;
  /** Marks the field as one the form cannot be sent without. */
  required?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs + 2 }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <AppText size="sm" weight="medium">
          {label}
        </AppText>
        {required ? (
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <AppText size="sm" tone="danger">
              *
            </AppText>
          </View>
        ) : null}
      </View>
      {children}
      {error || hint ? (
        <AppText size="xs" tone={error ? 'danger' : 'faint'}>
          {error ?? hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Input({
  style,
  invalid = false,
  right,
  ref,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  /** Draws the field in the danger colour. */
  invalid?: boolean;
  /** Something inside the field's right edge, such as a show/hide control. */
  right?: ReactNode;
  ref?: Ref<TextInput>;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const editable = props.editable !== false;

  let borderColor = theme.colors.borderStrong;
  if (invalid) {
    borderColor = theme.colors.danger;
  } else if (focused) {
    borderColor = theme.colors.primary;
  }

  const input = (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.textFaint}
      selectionColor={theme.colors.primary}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        {
          backgroundColor: editable ? theme.colors.surfaceRaised : theme.colors.surfaceSunken,
          borderColor,
          borderRadius: theme.radius.sm + 2,
          borderWidth: focused || invalid ? 1.5 : 1,
          color: theme.colors.text,
          // 16, never smaller: the platforms zoom a focused input below that.
          fontSize: theme.fontSize.input,
          minHeight: TOUCH_TARGET + 4,
          paddingHorizontal: theme.spacing.md,
          paddingRight: right ? 72 : theme.spacing.md,
          paddingVertical: theme.spacing.sm + 2,
        },
        props.multiline ? { textAlignVertical: 'top' } : null,
        style,
      ]}
      {...props}
    />
  );

  if (!right) {
    return input;
  }
  return (
    <View style={{ justifyContent: 'center' }}>
      {input}
      <View style={{ position: 'absolute', right: theme.spacing.xs }}>{right}</View>
    </View>
  );
}
