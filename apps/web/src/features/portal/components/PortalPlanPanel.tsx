import type { PortalProjectPlan } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate } from '../../../shared/lib/format';
import { toPortalBar } from '../../projects/components/plan-bars';
import { ProjectTimeline } from '../../projects/components/ProjectTimeline';
import { usePortalProjectPlanQuery } from '../api';

/**
 * The plan as the client sees it: the milestones the team shared, on the same chart the team
 * uses, with the same percentages — the API computes them once and narrows the payload.
 */
export function PortalPlanPanel({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const query = usePortalProjectPlanQuery(projectId, enabled);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <PlanBody plan={query.data} /> : null}
    </QueryState>
  );
}

function PlanBody({ plan }: { plan: PortalProjectPlan }) {
  return (
    <>
      <KpiGrid>
        <Kpi label="Progress" value={`${plan.progress.percent}%`} />
        <Kpi
          label="Milestones done"
          value={`${plan.progress.milestoneCompleted} / ${plan.progress.milestoneTotal}`}
        />
        <Kpi
          label="Work items done"
          value={`${plan.progress.taskCompleted} / ${plan.progress.taskTotal}`}
        />
        <Kpi label="First milestone" value={formatDate(plan.window.startDate)} />
        <Kpi label="Last milestone" value={formatDate(plan.window.endDate)} />
      </KpiGrid>
      <Card title="Plan">
        <ProjectTimeline
          window={plan.window}
          bars={plan.items.map(toPortalBar)}
          emptyTitle="No milestones shared yet"
          emptyDescription="Your team publishes milestones here as the plan is agreed."
        />
      </Card>
    </>
  );
}
