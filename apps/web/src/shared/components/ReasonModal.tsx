import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../hooks/use-submit-handler';

interface ReasonModalProps {
  open: boolean;
  title: string;
  label: string;
  submitLabel: string;
  /** When false the text is optional (a note); otherwise at least a few characters are needed. */
  required?: boolean;
  placeholder?: string;
  variant?: 'primary' | 'danger' | 'accent';
  busy?: boolean;
  onSubmit: (text: string) => Promise<unknown>;
  onClose: () => void;
}

/** One modal for every "explain why" step: request changes, reject, cancel, withdraw, note. */
export function ReasonModal({
  open,
  title,
  label,
  submitLabel,
  required = true,
  placeholder,
  variant = 'primary',
  busy = false,
  onSubmit,
  onClose,
}: ReasonModalProps) {
  const [text, setText] = useState('');
  const { error, wrap } = useSubmitHandler(() => {
    setText('');
    onClose();
  });
  const valid = !required || text.trim().length >= 3;
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant={variant}
            loading={busy}
            disabled={!valid}
            disabledReason="Write a few words first"
            onClick={() => void wrap(() => onSubmit(text.trim()))()}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <FormField label={label} required={required}>
        <Textarea
          rows={4}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
