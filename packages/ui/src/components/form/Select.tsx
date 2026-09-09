import { forwardRef, type SelectHTMLAttributes } from 'react';

import './form-controls.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid = false, className, ...rest },
  ref,
) {
  const classes = ['ui-control', className].filter(Boolean).join(' ');
  return (
    <select ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest}>
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
