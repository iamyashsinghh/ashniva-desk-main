import { isManagerRole } from '@ashniva/types';
import { Card, Kpi, KpiGrid, PageHeader, SkeletonText, Tabs } from '@ashniva/ui';
import { useState } from 'react';

import { useCurrentUser } from '../../auth/session-context';
import { QueryState } from '../../../shared/components/QueryState';
import { formatLongDate } from '../../../shared/lib/format';
import { useDashboardQuery, useOperationsDashboardQuery } from '../api';
import { DeveloperDashboard } from '../components/DeveloperDashboard';
import { EmployeeDashboard } from '../components/EmployeeDashboard';
import { ManagementDashboard } from '../components/ManagementDashboard';
import { OperationsDashboard } from '../components/operations/OperationsDashboard';
import { SeniorDashboard } from '../components/SeniorDashboard';
import { SupportDashboard } from '../components/SupportDashboard';
import { TesterDashboard } from '../components/TesterDashboard';

import '../dashboard.css';

type Panel = 'overview' | 'operations';

const PANEL_ID = 'dashboard-panel';
const PANEL_LABELS: Record<Panel, string> = { overview: 'Overview', operations: 'Operations' };

/** One route, one payload per role: the API decides which dashboard the person gets. */
export function DashboardPage() {
  const user = useCurrentUser();
  // Managers and team leads have a second, wider view. The role check here only decides whether
  // to ask for it; the API refuses it for anybody else and chooses its own sections.
  const canSeeOperations = isManagerRole(user.roleKey);
  const [panel, setPanel] = useState<Panel>('overview');
  const active = canSeeOperations ? panel : 'overview';
  // Only the visible panel polls.
  const query = useDashboardQuery(active === 'overview');
  const operations = useOperationsDashboardQuery(active === 'operations');

  return (
    <div className="dashboard">
      <PageHeader
        title={formatLongDate()}
        subtitle={`Good day, ${user.name.split(' ')[0]} · ${user.roleName}`}
      >
        {canSeeOperations ? (
          <Tabs
            aria-label="Dashboard view"
            value={active}
            onChange={setPanel}
            items={[
              { key: 'overview', label: 'Overview', panelId: PANEL_ID },
              { key: 'operations', label: 'Operations', panelId: PANEL_ID },
            ]}
          />
        ) : null}
      </PageHeader>
      {/*
        One panel element that swaps its contents, rather than one per tab: only the visible panel
        is ever mounted (only the visible panel polls), and a `tabpanel` whose element disappears
        leaves the tab pointing at nothing.
      */}
      <div
        id={PANEL_ID}
        role={canSeeOperations ? 'tabpanel' : undefined}
        aria-label={canSeeOperations ? PANEL_LABELS[active] : undefined}
      >
        {active === 'operations' ? (
          <QueryState
            isLoading={operations.isLoading}
            isError={operations.isError}
            error={operations.error}
            onRetry={() => void operations.refetch()}
            loadingFallback={<DashboardSkeleton />}
          >
            {operations.data ? <OperationsDashboard data={operations.data} /> : null}
          </QueryState>
        ) : (
          <QueryState
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={() => void query.refetch()}
            loadingFallback={<DashboardSkeleton />}
          >
            {query.data ? <DashboardBody data={query.data} /> : null}
          </QueryState>
        )}
      </div>
    </div>
  );
}

/**
 * The dashboard's own shape while it loads.
 *
 * The dashboard polls, and every role's payload starts with a row of tiles above two columns of
 * cards. A spinner in the middle of an empty page said "wait" and moved everything twice; this
 * says what is coming and holds the layout still.
 */
function DashboardSkeleton() {
  return (
    <div className="dashboard" aria-busy="true">
      <span className="sr-only">Loading your dashboard</span>
      <KpiGrid>
        {[0, 1, 2, 3].map((index) => (
          <Kpi key={index} label="" value="" loading />
        ))}
      </KpiGrid>
      <div className="dashboard__grid">
        {[0, 1].map((column) => (
          <div className="dashboard__column" key={column}>
            <Card title="">
              <SkeletonText lines={5} />
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardBody({
  data,
}: {
  data: NonNullable<ReturnType<typeof useDashboardQuery>['data']>;
}) {
  switch (data.kind) {
    case 'management':
      return <ManagementDashboard data={data} />;
    case 'senior':
      return <SeniorDashboard data={data} />;
    case 'developer':
      return <DeveloperDashboard data={data} />;
    case 'tester':
      return <TesterDashboard data={data} />;
    case 'support':
      return <SupportDashboard data={data} />;
    case 'employee':
      return <EmployeeDashboard data={data} />;
    // `GET /dashboard` never returns this one — the operational payload has its own route and its
    // own tab above — but it is part of the union, so the switch stays exhaustive.
    case 'operations':
      return <OperationsDashboard data={data} />;
    default:
      return null;
  }
}
