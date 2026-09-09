import {
  MILESTONE_STATUS_LABELS,
  PROJECT_PLAN_ITEM_KIND,
  type ProjectPlan,
  type ProjectPlanItem,
} from '@ashniva/types';
import { Badge, Card, EmptyState, Kpi, KpiGrid, Table, type TableColumn } from '@ashniva/ui';
import { Link, useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { MilestoneStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { useProjectPlanQuery } from '../api';
import { toInternalBar } from './plan-bars';
import { ProjectTimeline } from './ProjectTimeline';

import './plan.css';

/** The plan tab: the same milestones and work the rest of the app has, placed on a calendar. */
export function ProjectPlanPanel({ projectId }: { projectId: string }) {
  const query = useProjectPlanQuery(projectId);
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

function PlanBody({ plan }: { plan: ProjectPlan }) {
  const { progress } = plan;
  return (
    <>
      <KpiGrid>
        <Kpi label="Progress" value={`${progress.percent}%`} />
        <Kpi
          label="Tasks done"
          value={`${progress.taskCompleted} / ${progress.taskTotal}`}
          hint="Cancelled work is not counted"
        />
        <Kpi
          label="Milestones done"
          value={`${progress.milestoneCompleted} / ${progress.milestoneTotal}`}
        />
        <Kpi
          label="Deliverables"
          value={`${progress.deliverableCompleted} / ${progress.deliverableTotal}`}
        />
        <Kpi label="Plan starts" value={formatDate(plan.window.startDate)} />
        <Kpi label="Plan ends" value={formatDate(plan.window.endDate)} />
      </KpiGrid>
      <Card title="Timeline" headerAddon={<Badge tone="neutral">Derived from the work</Badge>}>
        <p className="plan-basis">
          {progress.basis === 'TASKS'
            ? `${progress.percent}% is completed tasks over tasks that are not cancelled. Every bar is computed the same way, from the deliverables and the tasks under it.`
            : 'This project has no task to count yet, so its progress reads 0%. The bars below still show what is planned.'}
        </p>
        <ProjectTimeline
          window={plan.window}
          bars={plan.items.map(toInternalBar)}
          emptyTitle="Nothing on the plan yet"
          emptyDescription="Add a milestone, or give the project's tasks dates, and they appear here."
        />
      </Card>
      <Card title="Milestones">
        <PlanItemTable items={plan.items} />
      </Card>
    </>
  );
}

function PlanItemTable({ items }: { items: ProjectPlanItem[] }) {
  const navigate = useNavigate();
  const milestones = items.filter((item) => item.kind === PROJECT_PLAN_ITEM_KIND.MILESTONE);
  const columns: TableColumn<ProjectPlanItem>[] = [
    {
      key: 'name',
      header: 'Milestone',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">
            <Link to={`/milestones/${row.id}`}>{row.name}</Link>
            {row.clientVisible ? (
              <Badge tone="success">Client</Badge>
            ) : (
              <Badge tone="neutral">Internal</Badge>
            )}
            {row.progressMode === 'MANUAL' ? <Badge tone="warning">Manual</Badge> : null}
          </span>
          <span className="task-cell__title">
            {row.tasks.completed}/{row.tasks.total} tasks · {row.deliverables.completed}/
            {row.deliverables.total} deliverables
            {row.owner ? ` · ${row.owner.name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      width: '190px',
      hideOnMobile: true,
      render: (row) => (
        <span className={row.isOverdue ? 'due--overdue' : undefined}>
          {formatDate(row.startDate)} → {formatDate(row.endDate)}
          {row.datesFromTasks ? <span className="muted"> · from the work</span> : null}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '90px',
      render: (row) => <strong>{row.progressPercent}%</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
      render: (row) =>
        row.status ? (
          <MilestoneStatusPill status={row.status} />
        ) : (
          <span className="muted">{MILESTONE_STATUS_LABELS.PLANNED}</span>
        ),
    },
  ];
  return (
    <Table
      aria-label="Plan milestones"
      columns={columns}
      rows={milestones}
      rowKey={(row) => row.id}
      onRowClick={(row) => void navigate(`/milestones/${row.id}`)}
      empty={
        <EmptyState
          title="No milestones yet"
          description="Milestones give the plan its shape; tasks without one are shown as unscheduled work."
        />
      }
    />
  );
}
