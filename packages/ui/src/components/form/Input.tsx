import { forwardRef, type InputHTMLAttributes } from 'react';

import './form-controls.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...rest },
  ref,
) {
  const classes = ['ui-control', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
});
