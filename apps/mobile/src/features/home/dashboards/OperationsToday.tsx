import type { OperationsScope, OperationsToday as OperationsTodayData } from '@ashniva/types';

import { TileGrid } from '../../../shared/components/data-display';
import type { IconName, IconTone } from '../../../shared/components/Icon';
import { operationsTaskTarget, type OperationsTaskCard } from './card-targets';
import { KpiTile } from './KpiTile';
import { DashboardSection } from './preview-lists';

/** Tile order is the order a lead reads them in: what is moving, then what is not. */
const CARDS: Array<{
  key: OperationsTaskCard & keyof OperationsTodayData;
  label: string;
  icon: IconName;
  iconTone: IconTone;
  warn?: true;
}> = [
  { key: 'scheduled', label: 'Scheduled today', icon: 'calendar', iconTone: 'info' },
  { key: 'started', label: 'Started today', icon: 'play-circle', iconTone: 'primary' },
  { key: 'completed', label: 'Completed today', icon: 'checkmark-done', iconTone: 'success' },
  { key: 'upcoming', label: 'Upcoming', icon: 'arrow-forward-circle', iconTone: 'teal' },
  { key: 'overdue', label: 'Overdue', icon: 'alarm', iconTone: 'danger', warn: true },
  { key: 'blocked', label: 'Blocked', icon: 'hand-left', iconTone: 'warning', warn: true },
  {
    key: 'returnedToDeveloper',
    label: 'Returned to developer',
    icon: 'return-down-back',
    iconTone: 'orange',
    warn: true,
  },
  { key: 'waitingForReview', label: 'Waiting for review', icon: 'eye', iconTone: 'violet' },
  { key: 'waitingForQa', label: 'Waiting for QA', icon: 'flask', iconTone: 'pink' },
];

/** Today across the people in scope. Every tile opens the exact task list it counted. */
export function OperationsToday({
  today,
  scope,
}: {
  today: OperationsTodayData;
  scope: OperationsScope;
}) {
  return (
    <DashboardSection
      title={scope.kind === 'team' ? 'Today · your team' : 'Today · organization'}
      icon="today-outline"
    >
      <TileGrid>
        {CARDS.map((card) => (
          <KpiTile
            key={card.key}
            label={card.label}
            value={today[card.key]}
            icon={card.icon}
            iconTone={card.iconTone}
            warn={card.warn ?? false}
            target={operationsTaskTarget(scope, card.key, card.label)}
          />
        ))}
      </TileGrid>
    </DashboardSection>
  );
}
