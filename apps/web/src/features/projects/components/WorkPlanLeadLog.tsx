import {
  extraSeconds,
  WORK_PLAN_EVENT_KIND,
  WORK_PLAN_EVENT_KIND_LABELS,
  WORK_PLAN_POINT_STATUS_LABELS,
  type WorkPlanPoint,
  type WorkPlanPointEvent,
} from '@ashniva/types';
import { useEffect, useState } from 'react';

import { formatDateTime } from '../../../shared/lib/format';

export function WorkPlanPointDetail({
  point,
  remaining,
}: {
  point: WorkPlanPoint;
  remaining: number;
}) {
  const extra = useExtra(point);
  const under = underSeconds(point, remaining, extra);
  return (
    <div className="work-plan__lead-detail">
      <dl>
        <div>
          <dt>Assigned time</dt>
          <dd>{point.isError ? 'error' : `${point.estimateMinutes} min`}</dd>
        </div>
        <div>
          <dt>Extra</dt>
          <dd className={extra > 0 ? 'work-plan__lead-over' : undefined}>
            {point.isError ? '—' : extraLabel(point, extra)}
          </dd>
        </div>
        {!point.isError && under > 0 ? (
          <div>
            <dt>Finished early</dt>
            <dd className="work-plan__lead-under">{formatDuration(under)} under</dd>
          </div>
        ) : null}
        <div>
          <dt>Assigned</dt>
          <dd>{point.assignedAt ? formatDateTime(point.assignedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{point.startedAt ? formatDateTime(point.startedAt) : '—'}</dd>
        </div>
        {point.completedAt ? (
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(point.completedAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Status</dt>
          <dd>{WORK_PLAN_POINT_STATUS_LABELS[point.status]}</dd>
        </div>
        {point.startedBy ? (
          <div>
            <dt>Developer</dt>
            <dd>{point.startedBy.name}</dd>
          </div>
        ) : null}
        {point.startedAt && !point.completedAt && !point.isError ? (
          <div>
            <dt>Timer</dt>
            <dd>
              <TimerText point={point} remaining={remaining} />
            </dd>
          </div>
        ) : null}
      </dl>
      <WorkPlanLeadLog point={point} />
    </div>
  );
}

export function WorkPlanLeadLog({ point }: { point: WorkPlanPoint }) {
  const sends = point.events.filter((event) => event.kind === WORK_PLAN_EVENT_KIND.SENT_TO_TESTER);
  const starts = point.events.filter(
    (event) =>
      event.kind === WORK_PLAN_EVENT_KIND.STARTED || event.kind === WORK_PLAN_EVENT_KIND.RESUMED,
  );
  const stops = point.events.filter((event) => event.kind === WORK_PLAN_EVENT_KIND.STOPPED);
  if (point.events.length === 0) {
    return null;
  }

  return (
    <div className="work-plan__lead-log">
      <p className="work-plan__lead-stats">
        Timeline · started {starts.length} {starts.length === 1 ? 'time' : 'times'}
        {stops.length > 0 ? ` · stopped ${stops.length}` : ''}
        {sends.length > 0
          ? ` · sent to tester ${sends.length} ${sends.length === 1 ? 'time' : 'times'}`
          : ''}
      </p>
      <ol>
        {point.events.map((event) => (
          <li key={event.id}>
            <LeadEventRow event={event} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function TimerText({ point, remaining }: { point: WorkPlanPoint; remaining: number }) {
  if (remaining === 0 || point.overdue) {
    return point.timerPaused ? 'Paused · Overdue' : 'Overdue';
  }
  const clock = formatClock(remaining);
  return point.timerPaused ? `Paused · ${clock}` : clock;
}

function extraLabel(point: WorkPlanPoint, extra: number): string {
  if (!point.startedAt) {
    return '—';
  }
  if (extra <= 0) {
    return '0 min';
  }
  const counting = point.completedAt ? '' : ' · counting';
  return `${formatDuration(extra)} more${counting}`;
}

/** Leftover assigned time when the point finished under estimate. */
function underSeconds(point: WorkPlanPoint, remaining: number, extra: number): number {
  if (!point.completedAt || point.isError || extra > 0) {
    return 0;
  }
  if (point.pausedRemainingSeconds != null && point.pausedRemainingSeconds > 0) {
    return point.pausedRemainingSeconds;
  }
  return remaining > 0 ? remaining : 0;
}

function LeadEventRow({ event }: { event: WorkPlanPointEvent }) {
  const sent = event.kind === WORK_PLAN_EVENT_KIND.SENT_TO_TESTER;
  const passed = event.kind === WORK_PLAN_EVENT_KIND.PASSED;
  const stopped = event.kind === WORK_PLAN_EVENT_KIND.STOPPED;
  const started =
    event.kind === WORK_PLAN_EVENT_KIND.STARTED || event.kind === WORK_PLAN_EVENT_KIND.RESUMED;
  const testerTook =
    !sent && !started && !stopped && event.sinceSubmitSeconds != null
      ? ` · tester took ${formatDuration(event.sinceSubmitSeconds)}`
      : '';
  const afterStart =
    sent || stopped
      ? ` · ${formatDuration(event.elapsedSeconds)} after start`
      : started && event.elapsedSeconds > 0
        ? ` · ${formatDuration(event.elapsedSeconds)} into task`
        : '';
  return (
    <div className="work-plan__lead-event">
      <b>
        {formatDateTime(event.createdAt)} · {WORK_PLAN_EVENT_KIND_LABELS[event.kind]}
      </b>
      <span>
        {event.actor.name}
        {afterStart}
        {testerTook}
        {event.extraSeconds > 0 ? ` · ${formatDuration(event.extraSeconds)} extra` : ''}
        {event.body && (stopped || started) ? ` · ${event.body}` : ''}
      </span>
      {!sent && !passed && !started && !stopped && event.body ? <p>{event.body}</p> : null}
    </div>
  );
}

function useExtra(point: WorkPlanPoint): number {
  const [seconds, setSeconds] = useState(point.extraSeconds);
  useEffect(() => {
    setSeconds(point.extraSeconds);
    if (!point.startedAt || point.completedAt || point.timerPaused || point.isError) {
      return undefined;
    }
    const tick = () => {
      setSeconds(
        extraSeconds(
          point.overrunSeconds,
          point.dueAt,
          new Date(),
          point.completedAt,
          point.pausedRemainingSeconds,
        ),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [
    point.overrunSeconds,
    point.extraSeconds,
    point.dueAt,
    point.completedAt,
    point.timerPaused,
    point.startedAt,
    point.pausedRemainingSeconds,
    point.isError,
  ]);
  return seconds;
}

function formatDuration(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return seconds === 0 || minutes >= 10 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
