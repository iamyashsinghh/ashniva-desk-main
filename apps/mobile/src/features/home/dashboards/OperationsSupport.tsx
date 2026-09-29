import type { OperationsScope, OperationsSupport as OperationsSupportData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import type { IconName, IconTone } from '../../../shared/components/Icon';
import { PressableCard } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { operationsTicketTarget, type OperationsTicketCard } from './card-targets';
import { useDashboardActions } from './dashboard-actions';
import { KpiTile } from './KpiTile';
import { CompactEmpty, DashboardSection } from './preview-lists';

const CARDS: Array<{
  key: OperationsTicketCard & keyof OperationsSupportData;
  label: string;
  icon: IconName;
  iconTone: IconTone;
  warn?: true;
}> = [
  { key: 'newTickets', label: 'New tickets', icon: 'sparkles', iconTone: 'info' },
  { key: 'assigned', label: 'Assigned', icon: 'person', iconTone: 'primary' },
  { key: 'escalated', label: 'Escalated', icon: 'trending-up', iconTone: 'orange', warn: true },
  { key: 'slaAtRisk', label: 'SLA at risk', icon: 'timer', iconTone: 'warning', warn: true },
  {
    key: 'slaBreached',
    label: 'SLA breached',
    icon: 'alert-circle',
    iconTone: 'danger',
    warn: true,
  },
];

/** Why a support tile on a lead's board does not open a list — see `operationsTicketTarget`. */
const SPANS_PROJECTS = 'Covers several projects';

/** The support desk: what nobody owns yet, what is late, and what needs somebody now. */
export function OperationsSupport({
  support,
  scope,
}: {
  support: OperationsSupportData;
  scope: OperationsScope;
}) {
  const theme = useTheme();
  const { onOpenTicket } = useDashboardActions();
  return (
    <View style={{ gap: theme.spacing.section }}>
      <DashboardSection title="Support" icon="headset-outline">
        <TileGrid>
          {CARDS.map((card) => {
            const target = operationsTicketTarget(scope, card.key, card.label);
            return (
              <KpiTile
                key={card.key}
                label={card.label}
                value={support[card.key]}
                icon={card.icon}
                iconTone={card.iconTone}
                warn={card.warn ?? false}
                target={target}
                {...(target ? {} : { caption: SPANS_PROJECTS })}
              />
            );
          })}
          <KpiTile
            label="Unacknowledged"
            value={support.unacknowledged}
            icon="notifications-off"
            iconTone="neutral"
            warn
            caption="No list selects these"
          />
        </TileGrid>
      </DashboardSection>

      <DashboardSection
        title="Needs somebody"
        icon="hand-left-outline"
        count={support.attention.length}
      >
        {support.attention.length === 0 ? (
          <CompactEmpty title="Nothing escalated or waiting to be acknowledged" />
        ) : null}
        {support.attention.slice(0, 5).map((row) => (
          <PressableCard
            key={row.ticket.id}
            accessibilityLabel={`${row.ticket.key} ${row.ticket.title}`}
            onPress={() => onOpenTicket?.(row.ticket.id)}
            chevron={Boolean(onOpenTicket)}
            icon="ticket"
            iconTone={row.escalationLevel > 0 ? 'danger' : 'orange'}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {row.ticket.key} · {row.owner ? `Owner: ${row.owner.name}` : 'In the queue'}
            </AppText>
            <AppText weight="medium" numberOfLines={2}>
              {row.ticket.title}
            </AppText>
            <AppText size="xs" tone="muted" numberOfLines={2}>
              {attentionDetail(row)}
            </AppText>
          </PressableCard>
        ))}
      </DashboardSection>
    </View>
  );
}

function attentionDetail(row: OperationsSupportData['attention'][number]): string {
  return [
    row.escalationLevel > 0 ? `Escalation ${row.escalationLevel}` : '',
    row.acknowledgedAt === null && row.acknowledgeDueAt
      ? `Acknowledge by ${formatDateTime(row.acknowledgeDueAt) ?? ''}`
      : '',
    row.queueReason ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}
