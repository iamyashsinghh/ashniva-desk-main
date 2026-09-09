import { TASK_TIMING_LABELS, type OperationsTime } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';

import { formatMinutes } from '../../../../shared/lib/format';
import { TaskTable } from '../../../tasks/components/TaskTable';
import { SectionTitle } from '../DashboardWidgets';

/**
 * Estimated against actual, and whether the work is going to land on time.
 *
 * None of these cards is clickable and that is not an oversight: the task list filters on the due
 * *date*, while a timing verdict is about the due *instant*, so no URL selects the rows these
 * numbers counted. The list underneath carries the same verdict per task, which is where a reader
 * goes next.
 */
export function OperationsTimeSection({ time }: { time: OperationsTime }) {
  const overrun = time.loggedMinutes - time.estimateMinutes;
  return (
    <>
      <SectionTitle hint="estimated against actual">Time</SectionTitle>
      <KpiGrid>
        <Kpi label={TASK_TIMING_LABELS.IN_HAND} value={time.inHand} />
        <Kpi label={TASK_TIMING_LABELS.AT_RISK} value={time.atRisk} warn={time.atRisk > 0} />
        <Kpi label={TASK_TIMING_LABELS.DELAYED} value={time.delayed} warn={time.delayed > 0} />
        <Kpi label="No due time" value={time.unscheduled} />
        <Kpi label="Finished on time" value={time.completedOnTime} />
        <Kpi label="Finished late" value={time.completedLate} warn={time.completedLate > 0} />
        <Kpi label="Estimated" value={formatMinutes(time.estimateMinutes)} />
        <Kpi
          label="Logged"
          value={formatMinutes(time.loggedMinutes)}
          hint={
            time.estimateMinutes > 0
              ? `${overrun >= 0 ? '+' : '−'}${formatMinutes(Math.abs(overrun))}`
              : undefined
          }
          warn={time.estimateMinutes > 0 && overrun > 0}
        />
      </KpiGrid>
      <Card
        title="Closest to their deadline"
        headerAddon={<span className="muted">open work</span>}
      >
        <TaskTable
          tasks={time.tasks}
          emptyTitle="Nothing with an expected finish time"
          emptyDescription="Tasks appear here once they have a due time to be measured against."
        />
      </Card>
    </>
  );
}
