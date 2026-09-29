import type { PortalProjectDetail } from '@ashniva/types';

import { KeyValueRow, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDate, formatSince } from '../../../shared/format/format';

/** The headline numbers, what was agreed, and who to talk to. */
export function ProjectOverviewPanel({
  project,
  onOpenTickets,
}: {
  project: PortalProjectDetail;
  /** The client's Tickets tab, where the open ones are listed. */
  onOpenTickets?: () => void;
}) {
  return (
    <>
      <TileGrid>
        <StatTile label="Progress" value={`${project.progressPercent}%`} icon="trending-up" />
        <StatTile
          label="In progress"
          value={project.taskCounts.inProgress}
          icon="construct-outline"
          iconTone="info"
        />
        <StatTile
          label="Completed"
          value={project.taskCounts.completed}
          icon="checkmark-done-outline"
          iconTone="success"
        />
        <StatTile
          label="Open tickets"
          value={project.openTicketCount}
          icon="ticket-outline"
          iconTone="orange"
          {...(onOpenTickets
            ? {
                onPress: onOpenTickets,
                accessibilityLabel: `Open tickets: ${project.openTicketCount}. Opens your tickets`,
              }
            : {})}
        />
      </TileGrid>

      <Section title="Scope" icon="document-text-outline">
        <AppText size="sm" tone={project.description?.trim() ? 'default' : 'muted'}>
          {project.description?.trim() || 'No description shared yet.'}
        </AppText>
      </Section>

      <Section title="Your contact" icon="person-outline">
        <KeyValueRow label="Project manager" value={project.manager?.name ?? 'To be confirmed'} />
        <KeyValueRow label="Started" value={formatDate(project.startDate) ?? '—'} />
        <KeyValueRow label="Delivery" value={formatDate(project.targetDate) ?? '—'} />
        <KeyValueRow label="Last update" value={formatSince(project.lastUpdateAt) ?? '—'} />
      </Section>
    </>
  );
}
