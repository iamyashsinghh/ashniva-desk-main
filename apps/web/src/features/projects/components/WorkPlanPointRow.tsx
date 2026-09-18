import {
  WORK_PLAN_POINT_STATUS,
  WORK_PLAN_POINT_STATUS_LABELS,
  type WorkPlanPoint,
} from '@ashniva/types';
import { Button } from '@ashniva/ui';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';

import { WorkPlanErrorModal } from './WorkPlanErrorModal';

export function WorkPlanPointRow({
  point,
  projectId,
  busy,
  highlighted,
  dragHandle,
  dropClass,
  onStart,
  onSubmitTest,
  onPass,
  onFail,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  point: WorkPlanPoint;
  projectId: string;
  busy: boolean;
  highlighted?: boolean;
  dragHandle?: ReactNode;
  dropClass?: string;
  onStart: () => void;
  onSubmitTest: () => void;
  onPass: () => void;
  onFail: (body: string, fileId?: string) => Promise<void> | void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const remaining = useRemaining(
    point.dueAt,
    point.completedAt,
    point.remainingSeconds,
    point.timerPaused,
  );
  const [reportingError, setReportingError] = useState(false);
  const classes = [
    'work-plan__read-point',
    highlighted ? 'work-plan__just-added' : '',
    dropClass ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-work-plan-id={point.id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragHandle}
      {point.body ? <p>{point.body}</p> : null}
      <div className="work-plan__read-meta">
        <span>{point.estimateMinutes} min</span>
        <span>{WORK_PLAN_POINT_STATUS_LABELS[point.status]}</span>
        {point.startedBy && point.startedAt ? <span>{point.startedBy.name}</span> : null}
        {point.startedAt && !point.completedAt ? (
          <TimerLabel point={point} remaining={remaining} />
        ) : null}
        {point.completedAt ? <span className="work-plan__done">Done</span> : null}
        {point.canStart ? (
          <Button size="sm" loading={busy} onClick={onStart}>
            {point.status === WORK_PLAN_POINT_STATUS.RETURNED ? 'Resume' : 'Start'}
          </Button>
        ) : null}
        {point.canSubmitTest ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onSubmitTest}>
            Send to tester
          </Button>
        ) : null}
        {point.canPass ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onPass}>
            Good
          </Button>
        ) : null}
        {point.canFail ? (
          <Button size="sm" loading={busy} onClick={() => setReportingError(true)}>
            Error
          </Button>
        ) : null}
      </div>
      {reportingError ? (
        <WorkPlanErrorModal
          projectId={projectId}
          busy={busy}
          onClose={() => setReportingError(false)}
          onSubmit={(body, fileId) => Promise.resolve(onFail(body, fileId))}
        />
      ) : null}
    </div>
  );
}

function TimerLabel({ point, remaining }: { point: WorkPlanPoint; remaining: number }) {
  if (remaining === 0 || point.overdue) {
    return (
      <span className="work-plan__timer work-plan__timer--late">
        {point.timerPaused ? 'Paused · Overdue' : 'Overdue'}
      </span>
    );
  }
  return (
    <span
      className={['work-plan__timer', point.timerPaused ? 'work-plan__timer--paused' : ''].join(
        ' ',
      )}
    >
      {point.timerPaused ? `Paused · ${formatClock(remaining)}` : formatClock(remaining)}
    </span>
  );
}

function useRemaining(
  dueAt: string | null,
  completedAt: string | null,
  initial: number,
  paused: boolean,
): number {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    setSeconds(initial);
    if (!dueAt || completedAt || paused) {
      return undefined;
    }
    const tick = () => {
      setSeconds(Math.max(0, Math.floor((new Date(dueAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [dueAt, completedAt, initial, paused]);
  return seconds;
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
