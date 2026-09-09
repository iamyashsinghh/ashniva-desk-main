import type { OperationsDashboard as OperationsDashboardData } from '@ashniva/types';
import { Kpi, KpiGrid } from '@ashniva/ui';

import { SectionTitle } from '../DashboardWidgets';
import { OperationsProjectsSection } from './OperationsProjectsSection';
import { OperationsReleaseSection } from './OperationsReleaseSection';
import { OperationsSupportSection } from './OperationsSupportSection';
import { OperationsTeamSection } from './OperationsTeamSection';
import { OperationsTimeSection } from './OperationsTimeSection';
import { OperationsTodaySection } from './OperationsTodaySection';

/**
 * Package 7b: what is happening across the projects this person is responsible for.
 *
 * A section the API left out is simply not rendered — no placeholder and no "you cannot see
 * this", because the caller was never told the section exists. The API decides; this file only
 * arranges.
 */
export function OperationsDashboard({ data }: { data: OperationsDashboardData }) {
  return (
    <>
      <OperationsTodaySection today={data.today} scope={data.scope} />
      <OperationsProjectsSection projects={data.projects} />
      <OperationsTeamSection team={data.team} availability={data.availability} />
      <OperationsTimeSection time={data.time} />
      <OperationsSupportSection support={data.support} scope={data.scope} />
      <OperationsReleaseSection release={data.release} />
      {data.cost ? (
        <>
          <SectionTitle hint="active contracts behind these projects">Cost</SectionTitle>
          <KpiGrid>
            {data.cost.map((row) => (
              <Kpi
                key={row.currency}
                label={`Contract value (${row.currency})`}
                value={row.contractValue}
                hint={`${row.contracts} contracts · internal ${row.internalCost}`}
              />
            ))}
          </KpiGrid>
        </>
      ) : null}
    </>
  );
}
