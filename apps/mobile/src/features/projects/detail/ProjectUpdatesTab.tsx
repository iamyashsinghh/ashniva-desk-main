import {
  CLIENT_UPDATE_STATUS,
  CLIENT_UPDATE_STATUS_LABELS,
  type ClientUpdateSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { QueryState } from '../../../shared/components/states';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { clientUpdateTone } from '../project-display';

export function projectUpdatesKey(projectId: string) {
  return ['client-updates', projectId] as const;
}

/**
 * The client updates raised from this project's work, published or waiting.
 *
 * Only a published update reaches the client; the banner says so once rather than every card
 * repeating it, and each card says which side of that line it is on.
 */
export function ProjectUpdatesTab({
  projectId,
  onOpenTask,
}: {
  projectId: string;
  onOpenTask: ((taskId: string) => void) | null;
}) {
  const theme = useTheme();
  const query = useResource<ClientUpdateSummary[]>(
    projectUpdatesKey(projectId),
    '/client-updates',
    {
      query: { projectId },
    },
  );
  const updates = query.data ?? [];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Banner tone="info">The client sees an update only once it is published.</Banner>
      <QueryState
        isLoading={query.isLoading}
        error={query.data ? null : query.error}
        isEmpty={updates.length === 0}
        emptyTitle="No client updates yet"
        emptyDescription="Completing a client-visible task drafts one."
        emptyIcon="megaphone-outline"
        onRetry={() => void query.refetch()}
        loadingLabel="Loading client updates"
      >
        <View style={{ gap: theme.spacing.sm }}>
          {updates.map((update) => (
            <UpdateCard key={update.id} update={update} onOpenTask={onOpenTask} />
          ))}
        </View>
      </QueryState>
    </View>
  );
}

function UpdateCard({
  update,
  onOpenTask,
}: {
  update: ClientUpdateSummary;
  onOpenTask: ((taskId: string) => void) | null;
}) {
  const published = update.status === CLIENT_UPDATE_STATUS.PUBLISHED;
  const task = update.task;
  return (
    <Card>
      <AppText weight="medium">{update.title}</AppText>
      <PillRow>
        <Pill
          label={CLIENT_UPDATE_STATUS_LABELS[update.status]}
          tone={clientUpdateTone(update.status)}
        />
        <Pill
          label={published ? 'Visible to client' : 'Internal only'}
          tone={published ? 'info' : 'neutral'}
        />
      </PillRow>
      <AppText size="sm" tone="muted" numberOfLines={4}>
        {update.body}
      </AppText>
      <MetaLine icon="calendar-outline">
        {formatDate(update.workDate) ?? update.workDate} · {update.author.name}
        {published && update.publishedBy ? ` · published by ${update.publishedBy.name}` : ''}
      </MetaLine>
      {task && onOpenTask ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            label={`Open ${task.key}`}
            variant="ghost"
            size="sm"
            icon="checkbox-outline"
            onPress={() => onOpenTask(task.id)}
          />
        </View>
      ) : null}
    </Card>
  );
}
