import {
  RELEASE_STATUS,
  RELEASE_STATUS_LABELS,
  type OperationsRelease,
  type ReleaseStatus,
} from '@ashniva/types';
import { Badge, Card, EmptyState, Kpi, KpiGrid } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDateTime } from '../../../../shared/lib/format';
import { SectionTitle } from '../DashboardWidgets';

const FAILED: ReleaseStatus[] = [RELEASE_STATUS.FAILED, RELEASE_STATUS.ROLLED_BACK];

/**
 * QA and the release pipeline.
 *
 * The counts come from the testing assignments and the releases themselves rather than from task
 * statuses, so they say what QA recorded rather than what the board looks like. There is no
 * cross-project QA list view to link to, so the releases below are the way through.
 */
export function OperationsReleaseSection({ release }: { release: OperationsRelease }) {
  return (
    <>
      <SectionTitle hint="what is waiting to ship">Release &amp; QA</SectionTitle>
      <KpiGrid>
        <Kpi label="QA waiting" value={release.qaWaiting} />
        <Kpi label="QA failed" value={release.qaFailed} warn={release.qaFailed > 0} />
        <Kpi label="QA passed" value={release.qaPassed} />
        <Kpi label="UAT pending" value={release.uatPending} />
        <Kpi label="Release blockers" value={release.blockers} warn={release.blockers > 0} />
        <Kpi label="Ready to release" value={release.readyToRelease} />
      </KpiGrid>
      <Card title="Releases">
        {release.releases.length === 0 ? (
          <EmptyState
            title="Nothing in the pipeline"
            description="Releases waiting for approval, scheduled, or gone wrong appear here."
          />
        ) : (
          <ul className="ops-attention">
            {release.releases.map((row) => (
              <li key={row.id}>
                <Link to={`/releases/${row.id}`}>
                  {row.project.code} {row.version} · {row.title}
                </Link>
                <Badge tone={FAILED.includes(row.status) ? 'danger' : 'info'}>
                  {RELEASE_STATUS_LABELS[row.status]}
                </Badge>
                <span className="ops-projects__meta">
                  {row.scheduledFor
                    ? `Scheduled for ${formatDateTime(row.scheduledFor)}`
                    : 'Not scheduled'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
