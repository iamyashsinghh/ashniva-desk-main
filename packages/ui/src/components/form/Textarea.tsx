import { forwardRef, type TextareaHTMLAttributes } from 'react';

import './form-controls.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...rest },
  ref,
) {
  const classes = ['ui-control', className].filter(Boolean).join(' ');
  return <textarea ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
});
