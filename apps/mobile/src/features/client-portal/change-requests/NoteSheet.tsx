import { useState } from 'react';

import type { IconName } from '../../../shared/components/Icon';
import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/** The API's floor for a decision note (`ChangeRequestDecisionDto`). */
export const MIN_NOTE_LENGTH = 3;

/**
 * A sheet asking for a note before a decision is sent: approve, ask for changes, reject, cancel.
 *
 * A note is optional only where the API says so (approving); everywhere else the button stays
 * disabled until the note is long enough for the API to accept, so the person is told what is
 * missing before they send rather than by a 400 after.
 */
export function NoteSheet({
  visible,
  title,
  subtitle,
  label,
  hint,
  confirmLabel,
  confirmIcon,
  required = true,
  danger = false,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  label: string;
  hint?: string;
  confirmLabel: string;
  confirmIcon: IconName;
  required?: boolean;
  danger?: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  const trimmed = note.trim();
  const tooShort = required ? trimmed.length < MIN_NOTE_LENGTH : false;

  // A fresh sheet each time it opens: a half-written rejection must not greet the next approval.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setNote('');
    }
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={confirmLabel}
            icon={confirmIcon}
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={tooShort}
            onPress={() => onConfirm(trimmed)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field
        label={label}
        required={required}
        hint={hint ?? (required ? 'At least three characters. The other side reads this.' : '')}
      >
        <Input
          accessibilityLabel={label}
          autoFocus
          multiline
          numberOfLines={4}
          maxLength={2000}
          onChangeText={setNote}
          style={{ minHeight: theme.spacing.xxl * 3 }}
          value={note}
        />
      </Field>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
