import type { ReactNode } from 'react';

import { Skeleton } from '../skeleton/Skeleton';

import './kpi.css';

export type KpiTone = 'default' | 'warn' | 'success';

export interface KpiProps {
  label: string;
  value: ReactNode;
  /** Small text next to the value (e.g. "SLA 25m", "3h 20m"). */
  hint?: ReactNode;
  /** Red left border and value: something needs attention. */
  warn?: boolean;
  /** Colours the accent edge. `warn` remains as the shorthand every dashboard already passes. */
  tone?: KpiTone;
  /** Placeholder in the shape of the tile, so a dashboard does not reflow when the numbers land. */
  loading?: boolean;
  onClick?: () => void;
  selected?: boolean;
}

/** The KPI card row at the top of every dashboard (label above, large number below). */
export function Kpi({
  label,
  value,
  hint,
  warn = false,
  tone = 'default',
  loading = false,
  onClick,
  selected = false,
}: KpiProps) {
  const effectiveTone: KpiTone = warn ? 'warn' : tone;
  const classes = [
    'ui-kpi',
    `ui-kpi--${effectiveTone}`,
    onClick ? 'ui-kpi--clickable' : '',
    selected ? 'ui-kpi--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className="ui-kpi__label">{label}</span>
      {loading ? (
        <Skeleton width="3.5em" height="var(--font-size-2xl)" />
      ) : (
        <span className="ui-kpi__value">
          {value}
          {hint ? <span className="ui-kpi__hint">{hint}</span> : null}
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="ui-kpi-grid">{children}</div>;
}
