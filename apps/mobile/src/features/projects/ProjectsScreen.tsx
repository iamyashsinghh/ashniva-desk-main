import { PERMISSIONS, seesAllOrganizationProjects, type ProjectSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { Segmented } from '../../shared/components/navigation-list';
import { Button, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ProjectCard } from './ProjectCard';
import { PullRefresh } from '../../shared/components/PullRefresh';

type Scope = 'all' | 'mine';

const SCOPES = [
  { value: 'all', label: 'All projects', icon: 'albums-outline' },
  { value: 'mine', label: 'My projects', icon: 'person-outline' },
] as const;

/**
 * The projects you can see, with a search and — for somebody who sees the whole organization —
 * a switch down to the ones they are on.
 *
 * `GET /projects` already limits everybody else to their own projects, so for them "mine" and
 * "all" are the same list; the switch is only drawn where it changes something, as on the web.
 * Searching is the API's (`search` matches name and code), so a long list is not downloaded to be
 * filtered on the phone.
 */
export function ProjectsScreen({
  onOpen,
  onCreate,
}: {
  onOpen: (projectId: string) => void;
  /** Leave out where the stack has no form to open; the button is also hidden without permission. */
  onCreate?: () => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const term = useDebounced(search.trim());
  const seesAll = user ? seesAllOrganizationProjects(user.roleKey) : false;
  const mine = seesAll && scope === 'mine';
  const filtered = Boolean(term) || mine;

  const query = useResource<ProjectSummary[]>(
    filtered ? ['projects', 'list', { mine, search: term }] : ['projects'],
    '/projects',
    { query: { ...(mine ? { mine: true } : {}), ...(term ? { search: term } : {}) } },
  );
  const projects = query.data ?? [];
  const canCreate = Boolean(onCreate) && can(PERMISSIONS.PROJECT_MANAGE);

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search projects" />
      {seesAll ? (
        <Segmented label="Which projects" options={SCOPES} value={scope} onChange={setScope} />
      ) : null}
      {canCreate && onCreate ? (
        <Button label="New project" icon="add" variant="secondary" onPress={onCreate} />
      ) : null}
    </View>
  );

  let empty = (
    <EmptyState
      title="No projects"
      description="Projects you are on will appear here."
      icon="folder-open-outline"
    />
  );
  if (query.isLoading) {
    empty = <LoadingState label="Loading projects" />;
  } else if (query.error) {
    empty = (
      <ErrorState
        message={errorMessage(query.error)}
        offline={query.error instanceof Error && query.error.name === 'NetworkError'}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (filtered) {
    empty = (
      <EmptyState
        title="No matching projects"
        description={term ? `Nothing matches “${term}”.` : 'You are not on any project yet.'}
        icon="search"
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={projects}
        keyExtractor={(project) => project.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        renderItem={({ item }) => <ProjectCard project={item} onPress={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
