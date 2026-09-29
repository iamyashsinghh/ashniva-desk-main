import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { ConfirmPasswordField } from './ConfirmPasswordField';
import { SheetActions } from './SheetActions';

/**
 * The last step of saving a long form behind a fresh password check. The form itself is a screen,
 * so the password is asked for in a sheet over it rather than as one more field at the bottom that
 * somebody has to scroll to find.
 */
export function PasswordConfirmSheet({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onEdit,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
  /** Clears a stale error once the password is being retyped. */
  onEdit: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel={confirmLabel}
          confirmIcon="lock-closed-outline"
          busy={busy}
          disabled={password.length === 0}
          onCancel={onClose}
          onConfirm={() => onConfirm(password)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {message}
      </AppText>
      <ConfirmPasswordField
        value={password}
        onChange={(value) => {
          onEdit();
          setPassword(value);
        }}
        reason="Asked again for changes to what is printed on a tax document."
      />
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
