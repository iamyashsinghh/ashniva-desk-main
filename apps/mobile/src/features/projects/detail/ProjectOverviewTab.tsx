import { CONVERSATION_KIND, PROJECT_HEALTH, type ProjectDetail } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../../chat/OpenConversationButton';
import { projectHealthLabel, projectTypeLabel } from '../project-display';

/** Scope, dates, people, health and the counts behind them — the web's overview panel. */
export function ProjectOverviewTab({
  project,
  onOpenChat,
}: {
  project: ProjectDetail;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
}) {
  const theme = useTheme();
  const counts = project.taskCounts;
  const onTrack = project.health === PROJECT_HEALTH.ON_TRACK;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <TileGrid>
        <StatTile
          label="Open tasks"
          value={counts.open}
          icon="list-outline"
          iconTone="info"
          caption={`${counts.inProgress} in progress`}
        />
        <StatTile label="In review" value={counts.inReview} icon="eye-outline" iconTone="violet" />
        <StatTile
          label="Overdue"
          value={counts.overdue}
          tone={counts.overdue > 0 ? 'danger' : 'default'}
          icon="alarm-outline"
          iconTone={counts.overdue > 0 ? 'danger' : 'success'}
        />
        <StatTile
          label="Blocked"
          value={counts.blocked}
          tone={counts.blocked > 0 ? 'warning' : 'default'}
          icon="hand-left-outline"
          iconTone={counts.blocked > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Open tickets"
          value={project.openTicketCount}
          icon="ticket-outline"
          iconTone="orange"
        />
        <StatTile
          label="Health"
          value={projectHealthLabel(project.health)}
          tone={onTrack ? 'default' : 'warning'}
          icon="pulse-outline"
          iconTone={onTrack ? 'success' : 'warning'}
        />
      </TileGrid>

      <Section title="Scope" icon="document-text-outline">
        <AppText size="sm" tone={project.description?.trim() ? 'default' : 'muted'}>
          {project.description?.trim() || 'No description yet.'}
        </AppText>
      </Section>

      <Section title="People and dates" icon="people-outline">
        <View>
          <KeyValueRow label="Manager" value={project.manager?.name ?? '—'} />
          <KeyValueRow label="Lead" value={project.lead?.name ?? '—'} />
          <KeyValueRow label="Team" value={project.team?.name ?? '—'} />
          <KeyValueRow label="Members" value={project.members.length} />
          <KeyValueRow label="Type" value={projectTypeLabel(project.type)} />
          <KeyValueRow
            label="Client UAT"
            value={project.requiresClientUat ? 'Required' : 'Not required'}
          />
          <KeyValueRow label="Started" value={formatDate(project.startDate) ?? '—'} />
          <KeyValueRow label="Target delivery" value={formatDate(project.targetDate) ?? '—'} />
        </View>
      </Section>

      {onOpenChat ? (
        <OpenConversationButton
          anchor={{ kind: CONVERSATION_KIND.PROJECT, projectId: project.id }}
          label="Project channel"
          hint="Opens the internal conversation for this project"
          onOpened={onOpenChat}
        />
      ) : null}
    </View>
  );
}
