import type { ProjectSummary } from '@ashniva/types';
import { FlatList, RefreshControl, View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { ProgressBar } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  projectHealthLabel,
  projectHealthTone,
  projectStatusLabel,
  projectStatusTone,
} from './project-display';

/**
 * The projects you can see.
 *
 * Read-only on the phone, and that is the whole design. Creating a project, editing its dates or
 * setting its members are decisions taken with a contract and a team calendar in front of you;
 * what a phone is for is checking where something stands between meetings.
 *
 * `GET /projects` answers with what the caller may see and nothing else — there is no `mine`
 * filter applied here, because the API has already decided which projects that is.
 */
export function ProjectsScreen({ onOpen }: { onOpen: (projectId: string) => void }) {
  const theme = useTheme();
  const query = useResource<ProjectSummary[]>(['projects'], '/projects');
  const projects = query.data ?? [];

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading projects" />
      </Screen>
    );
  }

  if (query.error && projects.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'Could not load projects'}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={projects}
        keyExtractor={(project) => project.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState title="No projects" description="Projects you are on will appear here." />
        }
        renderItem={({ item }) => (
          <PressableCard
            accessibilityLabel={`${item.code} ${item.name}`}
            accessibilityHint="Opens the project"
            onPress={() => onOpen(item.id)}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {item.code}
              {item.clientOrganization ? ` · ${item.clientOrganization.name}` : ''}
            </AppText>
            <AppText weight="medium" numberOfLines={2}>
              {item.name}
            </AppText>
            <PillRow>
              <Pill label={projectStatusLabel(item.status)} tone={projectStatusTone(item.status)} />
              <Pill label={projectHealthLabel(item.health)} tone={projectHealthTone(item.health)} />
            </PillRow>
            <View style={{ gap: theme.spacing.xs }}>
              <ProgressBar percent={item.progressPercent} />
              <AppText size="xs" tone="muted" tabular>
                {item.progressPercent}% done · {item.taskCounts.open} open ·{' '}
                {item.taskCounts.overdue} overdue
              </AppText>
            </View>
          </PressableCard>
        )}
      />
    </Screen>
  );
}
