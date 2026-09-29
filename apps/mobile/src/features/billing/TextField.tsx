import type { ComponentProps } from 'react';

import { Field, Input } from '../../shared/components/primitives';

type InputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onChangeText'>;

/** A labelled text input bound to one string — the settings forms have two dozen of them. */
export function TextField({
  label,
  value,
  onChange,
  required = false,
  hint,
  ...input
}: InputProps & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} required={required} {...(hint ? { hint } : {})}>
      <Input accessibilityLabel={label} value={value} onChangeText={onChange} {...input} />
    </Field>
  );
}
