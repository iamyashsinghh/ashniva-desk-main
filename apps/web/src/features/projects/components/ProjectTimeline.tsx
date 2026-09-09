import type { ProjectPlanWindow } from '@ashniva/types';
import { EmptyState } from '@ashniva/ui';
import type { ReactNode } from 'react';

import { formatDate } from '../../../shared/lib/format';
import { bandFor, monthTicks, todayPercent } from './timeline-layout';

import './plan.css';

export type TimelineTone = 'planned' | 'active' | 'done' | 'late';

/**
 * One bar. Deliberately not `ProjectPlanItem`: the client portal draws the same chart from a
 * narrower payload, and a chart that insisted on the internal shape would have to be written
 * twice or handed fields a client is not given.
 */
export interface TimelineBar {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  tone: TimelineTone;
  /** A status pill or badge, shown beside the name. */
  badge?: ReactNode;
  /** One line under the name: deliverables, tasks, owner. */
  meta?: string;
}

export function ProjectTimeline({
  window,
  bars,
  emptyTitle = 'Nothing on the plan yet',
  emptyDescription,
}: {
  window: ProjectPlanWindow;
  bars: TimelineBar[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (bars.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  const ticks = monthTicks(window);
  const today = todayPercent(window);
  const undated = bars.filter((bar) => bandFor(window, bar.startDate, bar.endDate) === null);

  return (
    <div className="plan-timeline">
      <div className="plan-timeline__scroll">
        <div className="plan-timeline__chart">
          <div className="plan-timeline__axis" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={`${tick.label}-${tick.percent}`}
                className="plan-timeline__tick"
                style={{ left: `${tick.percent}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <ol className="plan-timeline__rows">
            {bars.map((bar) => (
              <TimelineRow key={bar.id} bar={bar} window={window} today={today} />
            ))}
          </ol>
          <p className="plan-timeline__range">
            {formatDate(window.startDate)} — {formatDate(window.endDate)}
          </p>
        </div>
      </div>
      {undated.length > 0 ? (
        <p className="plan-timeline__note">
          {undated.length === 1 ? 'One item has' : `${undated.length} items have`} no dates yet, so{' '}
          {undated.length === 1 ? 'it is' : 'they are'} listed without a bar:{' '}
          {undated.map((bar) => bar.name).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}

function TimelineRow({
  bar,
  window,
  today,
}: {
  bar: TimelineBar;
  window: ProjectPlanWindow;
  today: number | null;
}) {
  const band = bandFor(window, bar.startDate, bar.endDate);
  return (
    <li className="plan-timeline__row">
      <div className="plan-timeline__label">
        <span className="plan-timeline__name">
          {bar.name}
          {bar.badge}
        </span>
        <span className="plan-timeline__meta">
          {formatDate(bar.startDate)} → {formatDate(bar.endDate)}
          {bar.meta ? ` · ${bar.meta}` : ''}
        </span>
      </div>
      <div className="plan-timeline__track">
        {today !== null ? (
          <span className="plan-timeline__today" style={{ left: `${today}%` }} aria-hidden="true" />
        ) : null}
        {band ? (
          <span
            className={`plan-timeline__bar plan-timeline__bar--${bar.tone}`}
            style={{ left: `${band.offsetPercent}%`, width: `${band.widthPercent}%` }}
            // The row already reads out in text; the bar repeats it for a pointer user.
            title={`${bar.name} · ${bar.progressPercent}% · ${formatDate(bar.startDate)} → ${formatDate(bar.endDate)}`}
          >
            <span
              className="plan-timeline__fill"
              style={{ width: `${bar.progressPercent}%` }}
              aria-hidden="true"
            />
          </span>
        ) : (
          <span className="plan-timeline__undated">No dates yet</span>
        )}
      </div>
      <span className="plan-timeline__percent">{bar.progressPercent}%</span>
    </li>
  );
}
