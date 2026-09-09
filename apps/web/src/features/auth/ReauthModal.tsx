import { Alert, Button, FormField, Input, Modal } from '@ashniva/ui';
import { useState } from 'react';

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

  async function confirm() {
    setSubmitting(true);
    setError(undefined);
    try {
      const token = await reauthenticate(password);
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
      title="Confirm your password"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={password.length === 0}
            disabledReason="Enter your password"
            onClick={() => void confirm()}
          >
            Confirm
          </Button>
        </>
      }
    >
      <p className="actions-card__hint" style={{ marginBottom: 10 }}>
        This change is sensitive, so please re-enter your password to continue.
      </p>
      <FormField label="Password" required>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
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
