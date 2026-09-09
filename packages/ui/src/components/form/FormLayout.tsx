import type { ReactNode } from 'react';

import './form-controls.css';

export interface FormGridProps {
  children: ReactNode;
  /** One column on a phone regardless; this is the desktop count. */
  columns?: 1 | 2;
  className?: string;
}

/**
 * The two-column field grid every form in this product uses.
 *
 * `.form-grid` appears in 46 files and `.form-actions` in 19, and both are declared in
 * `features/tasks/tasks.css` — which is why eight unrelated features import the tasks stylesheet.
 * Moving them here is what lets that import go away.
 */
export function FormGrid({ children, columns = 2, className }: FormGridProps) {
  const classes = ['ui-form-grid', `ui-form-grid--${columns}`, className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

/** A field that spans the whole grid — a description, a long text area, an alert. */
export function FormGridFull({ children }: { children: ReactNode }) {
  return <div className="ui-form-grid__full">{children}</div>;
}

/** The row of buttons at the end of a form. Right-aligned; full-width and stacked on a phone. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="ui-form-actions">{children}</div>;
}
