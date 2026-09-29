import { TASK_STATUS_LABELS, type ProblemDetail, type TaskStatus } from '@ashniva/types';

import { KeyValueRow, ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Pill } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';

function taskStatusLabel(status: string): string {
  return status in TASK_STATUS_LABELS ? TASK_STATUS_LABELS[status as TaskStatus] : status;
}

/**
 * What is being done about the problem, in the three rows the approved design shows.
 *
 * The permanent fix reads its status from the task — the fix is out because the work carrying it
 * finished, not because somebody ticked a box — which is exactly what the closure gate reads.
 */
export function ResolutionSection({
  problem,
  onOpenTask,
}: {
  problem: ProblemDetail;
  onOpenTask?: (taskId: string) => void;
}) {
  const { fixTask, preventiveTestTask } = problem;
  return (
    <Section title="Resolution" icon="construct-outline">
      {fixTask ? (
        <ListRow
          icon="construct-outline"
          iconTone="success"
          title={`${fixTask.key} · ${fixTask.title}`}
          subtitle="Permanent fix"
          trailing={<Pill label={taskStatusLabel(fixTask.status)} tone="info" />}
          {...(onOpenTask ? { onPress: () => onOpenTask(fixTask.id) } : {})}
        />
      ) : (
        <KeyValueRow label="Permanent fix" value="Not assigned yet" />
      )}
      {problem.preventiveTest || preventiveTestTask ? (
        <ListRow
          icon="shield-checkmark-outline"
          iconTone="info"
          title={problem.preventiveTest ?? preventiveTestTask?.title ?? ''}
          subtitle={
            preventiveTestTask ? `Preventive test · ${preventiveTestTask.key}` : 'Preventive test'
          }
          {...(onOpenTask && preventiveTestTask
            ? { onPress: () => onOpenTask(preventiveTestTask.id) }
            : {})}
        />
      ) : (
        <>
          <KeyValueRow label="Preventive test" value="None recorded" />
          <AppText size="xs" tone="faint">
            Reported at closure, but not a blocker.
          </AppText>
        </>
      )}
      <KeyValueRow
        label="RCA due"
        value={problem.rcaDueDate ? (formatDate(problem.rcaDueDate) ?? '') : 'No date set'}
      />
    </Section>
  );
}
