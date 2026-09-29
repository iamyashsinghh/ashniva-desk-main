import { useState, type ComponentProps } from 'react';
import { Pressable } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { Field, Input } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'secureTextEntry' | 'right'>;

/**
 * A password input with a show/hide control.
 *
 * On a phone keyboard a mistyped password is invisible and expensive — a reset link, or a lockout
 * after the throttle — so being able to look at what was typed matters more than on a desktop.
 */
export function PasswordInput(props: PasswordInputProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <Input
      icon="lock-closed-outline"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          onPress={() => setVisible((value) => !value)}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: TOUCH_TARGET,
            paddingHorizontal: theme.spacing.sm,
          }}
        >
          <Icon
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.primary}
          />
        </Pressable>
      }
    />
  );
}

/** A new password and its confirmation, with the rule stated before it is broken. */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  min,
  label = 'New password',
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  min: number;
  label?: string;
}) {
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <Field label={label} required hint={`At least ${min} characters`}>
        <PasswordInput
          accessibilityLabel={label}
          autoComplete="new-password"
          textContentType="newPassword"
          onChangeText={onPassword}
          value={password}
        />
      </Field>
      <Field
        label="Confirm password"
        required
        error={mismatch ? 'The two passwords do not match' : null}
      >
        <PasswordInput
          accessibilityLabel="Confirm password"
          autoComplete="new-password"
          textContentType="newPassword"
          invalid={mismatch}
          onChangeText={onConfirm}
          value={confirm}
        />
      </Field>
    </>
  );
}
