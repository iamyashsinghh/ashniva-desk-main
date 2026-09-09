import { CONVERSATION_KIND, PROJECT_MEMBER_ROLE_LABELS, type ProjectDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import { projectHealthLabel, projectHealthTone, projectStatusLabel } from './project-display';

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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card>
          <AppText size="xs" tone="faint">
            {project.code}
            {project.clientOrganization ? ` · ${project.clientOrganization.name}` : ''}
          </AppText>
          <AppText size="lg" weight="bold">
            {project.name}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Pill label={projectStatusLabel(project.status)} />
            <Pill
              label={projectHealthLabel(project.health)}
              tone={projectHealthTone(project.health)}
            />
          </View>
          {project.description ? <AppText size="sm">{project.description}</AppText> : null}
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Progress
          </AppText>
          <AppText size="xl" weight="bold">
            {project.progressPercent}%
          </AppText>
          <Divider />
          <AppText size="sm">
            {counts.completed} of {counts.total} tasks done
          </AppText>
          <AppText size="sm" tone="muted">
            {counts.inProgress} in progress · {counts.inReview} in review · {counts.blocked} blocked
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
        </Card>

        {project.startDate || project.targetDate ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Dates
            </AppText>
            <AppText size="sm">
              {formatDate(project.startDate) ?? 'No start date'} →{' '}
              {formatDate(project.targetDate) ?? 'no target date'}
            </AppText>
          </Card>
        ) : null}

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Who is on it ({project.members.length})
          </AppText>
          {project.manager ? <AppText size="sm">Manager: {project.manager.name}</AppText> : null}
          {project.lead ? <AppText size="sm">Lead: {project.lead.name}</AppText> : null}
          {project.members.map((member) => (
            <View key={member.id} style={{ gap: theme.spacing.xs }}>
              <Divider />
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
          ))}
        </Card>

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
