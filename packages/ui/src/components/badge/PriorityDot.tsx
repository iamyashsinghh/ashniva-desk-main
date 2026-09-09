import { PRIORITY_LABELS, type Priority } from '@ashniva/types';

import './badge.css';

export interface PriorityDotProps {
  priority: Priority;
  /** Show the label text next to the dot. */
  showLabel?: boolean;
}

/**
 * Priority is a small coloured dot, not a colour flood (approved design rule).
 *
 * The dot alone is colour carrying meaning, which is exactly what a colour-blind reader cannot
 * use — so when the label is hidden it becomes screen-reader text rather than disappearing.
 */
export function PriorityDot({ priority, showLabel = false }: PriorityDotProps) {
  const label = PRIORITY_LABELS[priority];
  return (
    <span className="ui-priority">
      <span className={`ui-priority-dot ui-priority-dot--${priority}`} aria-hidden="true" />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label} priority</span>}
    </span>
  );
}
