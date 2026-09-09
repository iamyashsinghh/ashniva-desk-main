import type { HTMLAttributes, ReactNode } from 'react';

import type { Tone } from '../../tokens/status-tone';

import './badge.css';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Outline instead of fill, for badges sitting on a washed row or a coloured card. */
  outline?: boolean;
  children: ReactNode;
}

/** Small uppercase label, e.g. INTERNAL / CLIENT-VISIBLE. */
export function Badge({
  tone = 'neutral',
  outline = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = ['ui-badge', outline ? 'ui-badge--outline' : '', `ui-tone--${tone}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
