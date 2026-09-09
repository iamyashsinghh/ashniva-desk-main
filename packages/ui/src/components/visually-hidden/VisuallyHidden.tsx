import type { ReactNode } from 'react';

/** Renders text for screen readers only. Relies on the `.sr-only` rule in global.css. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
