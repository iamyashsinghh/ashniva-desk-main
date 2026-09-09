import { useId, type ReactNode } from 'react';

import './form-controls.css';

export interface FieldGroupProps {
  /** What the group of controls is choosing, e.g. "Priority". */
  legend: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** A SegmentedControl, a set of checkboxes, a picker — anything that is not one control. */
  children: ReactNode;
}

/**
 * `FormField` for a group of controls rather than a single one.
 *
 * Eight screens were writing `<div className="segmented-field"><span>Priority</span>…` — a label
 * that is not a label, attached to nothing, describing a group with no boundary. A `<fieldset>`
 * with a `<legend>` is the element for exactly this, and it is what makes a screen reader say
 * "Priority, High, radio button, 2 of 4" instead of "High, radio button".
 *
 * Separate from `FormField` rather than a mode of it, because the two wire up differently:
 * `FormField` clones its child to give it an id and `aria-describedby`, and there is no single
 * child here to clone.
 */
export function FieldGroup({
  legend,
  hint,
  error,
  required = false,
  disabled = false,
  children,
}: FieldGroupProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset
      className="ui-field ui-field-group"
      disabled={disabled}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="ui-field__label ui-field-group__legend">
        {legend}
        {required ? (
          <span className="ui-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      {children}
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
