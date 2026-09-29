import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';

/**
 * One question, one answer in words, one button — the phone's counterpart of the web's reason
 * dialog. Asking the developer, resolving an incident, approving an emergency fix: each is a
 * sentence somebody has to write, so each is this sheet with different words on it.
 *
 * `minLength` mirrors the API's own minimum for that field, so the button is off until what was
 * typed would be accepted; the server still checks.
 */
export function TextActionSheet({
  title,
  subtitle,
  label,
  hint,
  submitLabel,
  submitIcon = 'checkmark',
  danger = false,
  minLength = 1,
  maxLength = 5000,
  initialValue = '',
  placeholder,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  label: string;
  hint?: string;
  submitLabel: string;
  submitIcon?: IconName;
  danger?: boolean;
  /** Zero makes the text optional. */
  minLength?: number;
  maxLength?: number;
  initialValue?: string;
  placeholder?: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initialValue);
  const trimmed = text.trim();

  return (
    <Sheet
      visible
      title={title}
      {...(subtitle ? { subtitle } : {})}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={submitLabel}
            icon={submitIcon}
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={trimmed.length < minLength}
            onPress={() => onSubmit(trimmed)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label={label} required={minLength > 0} {...(hint ? { hint } : {})}>
        <Input
          accessibilityLabel={label}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={4}
          maxLength={maxLength}
          {...(placeholder ? { placeholder } : {})}
          style={{ minHeight: 104 }}
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
