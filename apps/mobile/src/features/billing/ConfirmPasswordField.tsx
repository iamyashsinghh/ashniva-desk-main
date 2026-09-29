import { Field } from '../../shared/components/primitives';
import { PasswordInput } from '../auth/PasswordInput';

/**
 * The password a guarded billing write asks for again, as a field in the sheet making the change.
 *
 * The hint says why, because a password prompt with no reason attached is exactly what a phishing
 * screen looks like.
 */
export function ConfirmPasswordField({
  value,
  onChange,
  reason,
}: {
  value: string;
  onChange: (value: string) => void;
  reason: string;
}) {
  return (
    <Field label="Your password" required hint={reason}>
      <PasswordInput
        accessibilityLabel="Your password"
        autoComplete="current-password"
        textContentType="password"
        value={value}
        onChangeText={onChange}
      />
    </Field>
  );
}
