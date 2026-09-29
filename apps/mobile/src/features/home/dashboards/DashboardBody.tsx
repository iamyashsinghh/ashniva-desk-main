import type { DashboardResponse } from '@ashniva/types';

import { DeveloperDashboard } from './DeveloperDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';
import { ManagementDashboard } from './ManagementDashboard';
import { OperationsBoard } from './OperationsBoard';
import { SeniorDashboard } from './SeniorDashboard';
import { SupportDashboard } from './SupportDashboard';
import { TesterDashboard } from './TesterDashboard';

/** One route, one payload per role: the API decides which dashboard the person gets. */
export function DashboardBody({ data }: { data: DashboardResponse }) {
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
    // `GET /dashboard` never returns this one — it has its own route and segment — but it is in
    // the union, so the switch stays exhaustive.
    case 'operations':
      return <OperationsBoard data={data} />;
    default:
      return null;
  }
}
