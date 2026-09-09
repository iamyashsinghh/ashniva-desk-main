import { KpiGrid } from '@ashniva/ui';
import type { OperationsScope, OperationsToday } from '@ashniva/types';

import { operationsTaskLink, type OperationsTaskCard } from '../../card-links';
import { SectionTitle } from '../DashboardWidgets';
import { OperationsKpi } from './OperationsKpi';

/** Card order is the order a lead reads them in: what is moving, then what is not. */
const CARDS: Array<{ key: OperationsTaskCard; label: string; warn?: boolean }> = [
  { key: 'scheduled', label: 'Scheduled today' },
  { key: 'started', label: 'Started today' },
  { key: 'completed', label: 'Completed today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue', warn: true },
  { key: 'blocked', label: 'Blocked', warn: true },
  { key: 'returnedToDeveloper', label: 'Returned to developer', warn: true },
  { key: 'waitingForReview', label: 'Waiting for review' },
  { key: 'waitingForQa', label: 'Waiting for QA' },
];

const VALUES: Record<OperationsTaskCard, keyof OperationsToday> = {
  scheduled: 'scheduled',
  started: 'started',
  completed: 'completed',
  upcoming: 'upcoming',
  overdue: 'overdue',
  blocked: 'blocked',
  returnedToDeveloper: 'returnedToDeveloper',
  waitingForReview: 'waitingForReview',
  waitingForQa: 'waitingForQa',
};

/** Today across the people in scope. Every card opens the exact task list it counted. */
export function OperationsTodaySection({
  today,
  scope,
}: {
  today: OperationsToday;
  scope: OperationsScope;
}) {
  return (
    <>
      <SectionTitle hint={scope.kind === 'team' ? 'your team' : 'the whole organization'}>
        Today
      </SectionTitle>
      <KpiGrid>
        {CARDS.map((card) => (
          <OperationsKpi
            key={card.key}
            label={card.label}
            value={today[VALUES[card.key]]}
            warn={card.warn === true && today[VALUES[card.key]] > 0}
            to={operationsTaskLink(scope, card.key)}
          />
        ))}
      </KpiGrid>
    </>
  );
}
