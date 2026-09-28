import { CONVERSATION_KIND, PROJECT_MEMBER_ROLE_LABELS, type ProjectDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Avatar } from '../../shared/components/Avatar';
import { KeyValueRow, ProgressBar, StatTile, TileGrid } from '../../shared/components/data-display';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import {
  projectHealthLabel,
  projectHealthTone,
  projectStatusLabel,
  projectStatusTone,
} from './project-display';

/**
 * One project: where it stands, who is on it, and a way into its channel.
 *
 * No editing. The screen answers "how is this going and who do I ask", which is what somebody
 * away from their desk needs; changing dates, members or scope is not.
 */
export function ProjectDetailScreen({
  projectId,
  onOpenChat,
}: {
  projectId: string;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
}) {
  const theme = useTheme();
  const query = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`);
  const project = query.data ?? null;

  if (!project && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!project) {
    return (
      <Screen>
        <LoadingState label="Loading the project" />
      </Screen>
    );
  }

  const counts = project.taskCounts;
  const startDate = formatDate(project.startDate) ?? 'No start date';
  const targetDate = formatDate(project.targetDate) ?? 'no target date';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero
          overline={`${project.code}${project.clientOrganization ? ` · ${project.clientOrganization.name}` : ''}`}
          title={project.name}
        >
          <PillRow>
            <Pill
              label={projectStatusLabel(project.status)}
              tone={projectStatusTone(project.status)}
            />
            <Pill
              label={projectHealthLabel(project.health)}
              tone={projectHealthTone(project.health)}
            />
          </PillRow>
          {project.description ? (
            <AppText size="sm" tone="muted">
              {project.description}
            </AppText>
          ) : null}
        </Hero>

        <TileGrid>
          <StatTile label="Done" value={`${project.progressPercent}%`} tone="primary" />
          <StatTile label="Open" value={counts.open} />
          <StatTile
            label="Overdue"
            value={counts.overdue}
            tone={counts.overdue > 0 ? 'danger' : 'default'}
          />
        </TileGrid>

        <Section title="Progress">
          <ProgressBar
            percent={project.progressPercent}
            tone={project.progressPercent >= 100 ? 'success' : 'primary'}
            label="Tasks completed"
          />
          <View style={{ gap: theme.spacing.xs }}>
            <AppText size="sm" weight="medium">
              {counts.completed} of {counts.total} tasks done
            </AppText>
            <AppText size="sm" tone="muted">
              {counts.inProgress} in progress · {counts.inReview} in review · {counts.blocked}{' '}
              blocked
            </AppText>
            {counts.overdue > 0 ? (
              <AppText size="sm" tone="danger">
                {counts.overdue} overdue
              </AppText>
            ) : null}
            {project.openTicketCount > 0 ? (
              <AppText size="sm" tone="muted">
                {project.openTicketCount} open ticket
                {project.openTicketCount === 1 ? '' : 's'}
              </AppText>
            ) : null}
          </View>
        </Section>

        {project.startDate || project.targetDate ? (
          <Section title="Dates">
            <View>
              <KeyValueRow label="Start" value={startDate} />
              <KeyValueRow label="Target" value={targetDate} />
            </View>
          </Section>
        ) : null}

        <Section title="Who is on it" count={project.members.length}>
          {project.manager || project.lead ? (
            <View>
              {project.manager ? (
                <KeyValueRow label="Manager" value={project.manager.name} />
              ) : null}
              {project.lead ? <KeyValueRow label="Lead" value={project.lead.name} /> : null}
            </View>
          ) : null}
          {project.members.map((member, index) => (
            <View key={member.id} style={{ gap: theme.spacing.sm }}>
              {index > 0 || project.manager || project.lead ? <Divider /> : null}
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
                <Avatar name={member.name} size={32} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText size="sm" weight="medium">
                    {member.name}
                  </AppText>
                  <AppText size="xs" tone="muted">
                    {PROJECT_MEMBER_ROLE_LABELS[member.role] ?? member.role}
                    {member.responsibilities.length > 0
                      ? ` · ${member.responsibilities.join(', ')}`
                      : ''}
                  </AppText>
                </View>
              </View>
            </View>
          ))}
        </Section>

        {onOpenChat ? (
          <OpenConversationButton
            anchor={{ kind: CONVERSATION_KIND.PROJECT, projectId: project.id }}
            label="Project channel"
            hint="Opens the internal conversation for this project"
            onOpened={onOpenChat}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
