import type { ProjectSummary } from '@ashniva/types';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { projectHealthLabel, projectHealthTone, projectStatusLabel } from './project-display';

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
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.code} ${item.name}`}
            accessibilityHint="Opens the project"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {item.code}
                {item.clientOrganization ? ` · ${item.clientOrganization.name}` : ''}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.name}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Pill label={projectStatusLabel(item.status)} />
                <Pill
                  label={projectHealthLabel(item.health)}
                  tone={projectHealthTone(item.health)}
                />
              </View>
              <AppText size="sm" tone="muted">
                {item.progressPercent}% done · {item.taskCounts.open} open ·{' '}
                {item.taskCounts.overdue} overdue
              </AppText>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
