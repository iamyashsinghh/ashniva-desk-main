import type { HTMLAttributes } from 'react';

import type { Tone } from '../../tokens/status-tone';

import './badge.css';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone: Tone;
  label: string;
  size?: 'sm' | 'md';
  /** Outline instead of fill, for pills inside an already-tinted row. */
  outline?: boolean;
}

/**
 * Rounded status label. Callers pick the tone from TASK_STATUS_TONES / TICKET_STATUS_TONES so
 * one status always looks the same everywhere.
 */
export function StatusPill({
  tone,
  label,
  size = 'md',
  outline = false,
  className,
  ...rest
}: StatusPillProps) {
  const classes = [
    'ui-pill',
    size === 'sm' ? 'ui-pill--sm' : '',
    outline ? 'ui-pill--outline' : '',
    `ui-tone--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} {...rest}>
      {label}
    </span>
  );
}
