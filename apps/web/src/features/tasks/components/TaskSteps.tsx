import {
  PHASE1_TASK_HAPPY_PATH,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@ashniva/types';
import { StatusPill, TASK_STATUS_TONES } from '@ashniva/ui';

/** The step strip on the task detail: Assigned → In progress → Review → Completed, plus side states. */
export function TaskSteps({ status }: { status: TaskStatus }) {
  const index = PHASE1_TASK_HAPPY_PATH.indexOf(status);
  const onPath = index >= 0;
  const reached = status === TASK_STATUS.COMPLETED ? PHASE1_TASK_HAPPY_PATH.length : index;
  return (
    <div className="task-steps" aria-label="Workflow">
      {PHASE1_TASK_HAPPY_PATH.map((step, stepIndex) => {
        const done = onPath ? stepIndex < reached : stepIndex < impliedProgress(status);
        const current = step === status;
        if (current) {
          return (
            <StatusPill
              key={step}
              tone={TASK_STATUS_TONES[step]}
              label={TASK_STATUS_LABELS[step]}
            />
          );
        }
        return (
          <span
            key={step}
            className={['task-steps__step', done ? 'task-steps__step--done' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {done ? '✓ ' : ''}
            {TASK_STATUS_LABELS[step]}
          </span>
        );
      })}
      {!onPath ? (
        <StatusPill tone={TASK_STATUS_TONES[status]} label={`● ${TASK_STATUS_LABELS[status]}`} />
      ) : null}
    </div>
  );
}

/** How far along the happy path a side state sits (for the ✓ marks). */
function impliedProgress(status: TaskStatus): number {
  switch (status) {
    case TASK_STATUS.RETURNED_TO_DEV:
    case TASK_STATUS.BLOCKED:
      return 1;
    case TASK_STATUS.REOPENED:
      return 1;
    default:
      return 0;
  }
}
