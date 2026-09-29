import {
  PERMISSIONS,
  PROJECT_STATUS,
  PROJECT_STATUS_LABELS,
  type PortalProjectSummary,
  type ProjectStatus,
} from '@ashniva/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { MetaLine, ProgressBar } from '../../../shared/components/data-display';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { portalKeys } from '../portal-keys';
import { portalProjectTone } from '../portal-display';
import { PermissionGate } from '../PortalFrame';
import { PortalList } from '../PortalList';
import { StatusChips } from '../StatusChips';

/**
 * A client's projects: progress and delivery date only — no health, estimate or cost, because the
 * portal endpoint carries none of them.
 *
 * `GET /portal/projects` returns the organization's whole (short) list with no search parameter,
 * so the search and the status chips narrow what is already on the phone.
 */
export function PortalProjectsScreen({ onOpen }: { onOpen: (projectId: string) => void }) {
  return (
    <PermissionGate
      permission={PERMISSIONS.PROJECT_READ}
      title="Projects are not shared with you"
      description="Ask your administrator if you need to follow a project here."
    >
      <ProjectList onOpen={onOpen} />
    </PermissionGate>
  );
}

function ProjectList({ onOpen }: { onOpen: (projectId: string) => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const query = useResource<PortalProjectSummary[]>(portalKeys.projects, '/portal/projects');
  const projects = useMemo(() => query.data ?? [], [query.data]);

  const statuses = useMemo(
    () => [...new Set(projects.map((project) => project.status))],
    [projects],
  );
  const term = search.trim().toLowerCase();
  const visible = projects.filter(
    (project) =>
      (!status || project.status === status) &&
      (!term ||
        project.name.toLowerCase().includes(term) ||
        project.code.toLowerCase().includes(term)),
  );

  return (
    <PortalList
      items={visible}
      isLoading={query.isLoading}
      error={query.error}
      isRefreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      loadingLabel="Loading your projects"
      emptyTitle="No projects yet"
      emptyDescription="Projects your team runs for you will appear here."
      emptyIcon="folder-open-outline"
      filtered={Boolean(term) || status !== null}
      header={
        <View style={{ gap: theme.spacing.sm }}>
          <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search projects" />
          {statuses.length > 1 ? (
            <StatusChips
              options={statuses}
              value={status}
              onChange={setStatus}
              labelFor={(value) => PROJECT_STATUS_LABELS[value]}
            />
          ) : null}
        </View>
      }
      renderItem={(project) => (
        <PortalProjectCard project={project} onPress={() => onOpen(project.id)} />
      )}
    />
  );
}

function PortalProjectCard({
  project,
  onPress,
}: {
  project: PortalProjectSummary;
  onPress: () => void;
}) {
  const theme = useTheme();
  const counts = project.taskCounts;
  const delivery = formatDate(project.targetDate);
  const updated = formatSince(project.lastUpdateAt);
  return (
    <PressableCard
      accessibilityLabel={`${project.code} ${project.name}`}
      accessibilityHint="Opens the project"
      onPress={onPress}
      icon="folder-open"
      iconTone={project.status === PROJECT_STATUS.ACTIVE ? 'primary' : 'neutral'}
    >
      <MetaLine icon="pricetag-outline">{project.code}</MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {project.name}
      </AppText>
      <PillRow>
        <Pill
          label={PROJECT_STATUS_LABELS[project.status]}
          tone={portalProjectTone(project.status)}
        />
      </PillRow>
      <View style={{ gap: theme.spacing.xs }}>
        <ProgressBar
          percent={project.progressPercent}
          tone={project.progressPercent >= 100 ? 'success' : 'primary'}
          label={`Progress on ${project.name}`}
        />
        <MetaLine icon="trending-up">
          {project.progressPercent}% · {counts.completed} of {counts.total} done ·{' '}
          {counts.inProgress} in progress
        </MetaLine>
        {project.manager ? (
          <MetaLine icon="person-outline">Your contact {project.manager.name}</MetaLine>
        ) : null}
        {delivery ? <MetaLine icon="flag-outline">Delivery {delivery}</MetaLine> : null}
        {updated ? <MetaLine icon="time-outline">Last update {updated}</MetaLine> : null}
      </View>
    </PressableCard>
  );
}
