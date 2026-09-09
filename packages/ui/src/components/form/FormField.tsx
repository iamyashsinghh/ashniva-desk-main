import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

import './form-controls.css';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  invalid?: boolean;
  required?: boolean;
}

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /**
   * Marks the field "Optional" in the label.
   *
   * Worth having as well as `required`, because a form where most fields are required and two are
   * not is read faster by marking the two than by marking everything else.
   */
  optional?: boolean;
  /** A single Input, Textarea or Select. The field wires id, describedby and invalid state. */
  children: ReactElement<ControlProps>;
  /** Extra content shown next to the label (e.g. a visibility badge). */
  labelAddon?: ReactNode;
}

/**
 * Label + control + hint/error, with the ARIA wiring done once here instead of in every form.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  optional = false,
  children,
  labelAddon,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = cloneElement(children, {
    id: controlId,
    'aria-describedby': describedBy,
    invalid: Boolean(error),
    required,
  });

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="ui-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
        {/* Not aria-hidden: "optional" is information the required marker's `aria-required` gives
            for free on the other side, and a screen reader user needs it just as much. The space
            is explicit because JSX drops the one between an expression and an element, and the
            accessible name would otherwise read "ModuleOptional". */}
        {optional && !required ? (
          <>
            {' '}
            <span className="ui-field__optional">Optional</span>
          </>
        ) : null}
        {labelAddon}
      </label>
      {control}
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
    </div>
  );
}
