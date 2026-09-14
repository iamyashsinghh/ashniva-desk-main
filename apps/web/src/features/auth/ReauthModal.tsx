import { Alert, Button, FormField, Input, Modal } from '@ashniva/ui';
import { useEffect, useState } from 'react';

import { errorMessage } from '../../shared/lib/api-client';
import { reauthenticate } from './api';

interface ReauthModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirmed: (token: string) => void;
}

export function ReauthModal({ open, onCancel, onConfirmed }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [autofillLocked, setAutofillLocked] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPassword('');
    setError(undefined);
    setAutofillLocked(true);
  }, [open]);

  async function confirm() {
    const value = password.trim();
    if (value.includes('@')) {
      setError(`That is an email address. Type the password you use to sign in, not an email.`);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const token = await reauthenticate(value);
      setPassword('');
      onConfirmed(token);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Confirm it's you"
      description="Enter the password you use to sign in. Not a password for somebody else."
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={password.length === 0}
            disabledReason="Enter your sign-in password"
            onClick={() => void confirm()}
          >
            Confirm
          </Button>
        </>
      }
    >
      <FormField label="Your sign-in password" required>
        <Input
          type="password"
          name="ashniva-reauth-password"
          autoComplete="off"
          readOnly={autofillLocked}
          value={password}
          onFocus={() => setAutofillLocked(false)}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && password) {
              void confirm();
            }
          }}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
