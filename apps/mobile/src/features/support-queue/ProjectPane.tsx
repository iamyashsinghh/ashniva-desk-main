import type { EffectiveAvailability } from '@ashniva/types';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage, isOffline } from '../../shared/api/client';
import { SelectField } from '../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useActiveProjects, useSupportConfig } from './api';
import { AvailabilitySheet } from './AvailabilitySheet';
import { CoverageCard } from './CoverageCard';
import { OnCallSection } from './OnCallSection';
import { TeamMemberCard } from './TeamMemberCard';
import { WorkScheduleSheet } from './WorkScheduleSheet';
import { PullRefresh } from '../../shared/components/PullRefresh';

export type ProjectView = 'team' | 'on-call';

/**
 * The per-project half of the screen: who is available now, and who is on call.
 *
 * One project at a time, as on the web, because every one of these records is per project or per
 * person on it. The first active project is chosen until somebody picks another.
 */
export function ProjectPane({
  view,
  projectId,
  onProjectChange,
}: {
  view: ProjectView;
  projectId: string | null;
  onProjectChange: (id: string) => void;
}) {
  const theme = useTheme();
  const projects = useActiveProjects(true);
  const chosen = projectId ?? projects.data?.[0]?.id ?? null;
  const config = useSupportConfig(chosen, true);
  const [editingHours, setEditingHours] = useState<EffectiveAvailability | null>(null);
  const [editingState, setEditingState] = useState<EffectiveAvailability | null>(null);

  const options = useMemo(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
    [projects.data],
  );

  let body: ReactNode;
  if (projects.isLoading || config.isLoading) {
    body = <LoadingState label="Loading the team" variant="spinner" />;
  } else if (projects.error || (config.error && !config.data)) {
    const cause = projects.error ?? config.error;
    body = (
      <ErrorState
        message={errorMessage(cause)}
        offline={isOffline(cause)}
        onRetry={() => void (projects.error ? projects.refetch() : config.refetch())}
      />
    );
  } else if (!chosen || !config.data) {
    body = (
      <EmptyState
        icon="folder-open-outline"
        title="No active projects"
        description="Team availability and on-call cover are set per project."
      />
    );
  } else if (view === 'team') {
    body = (
      <>
        <CoverageCard ownership={config.data.ownership} team={config.data.team} />
        {config.data.team.length === 0 ? (
          <EmptyState icon="people-outline" title="This project has no members yet" />
        ) : null}
        {config.data.team.map((member) => (
          <TeamMemberCard
            key={member.userId}
            member={member}
            onEditSchedule={() => setEditingHours(member)}
            onEditAvailability={() => setEditingState(member)}
          />
        ))}
      </>
    );
  } else {
    body = (
      <OnCallSection
        key={chosen}
        projectId={chosen}
        onCall={config.data.onCall}
        team={config.data.team}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        refreshControl={
          <PullRefresh
            busy={config.isRefetching}
            onRefresh={() => void config.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <SelectField
          label="Project"
          icon="folder-outline"
          options={options}
          value={chosen ? [chosen] : []}
          onChange={(ids) => (ids[0] ? onProjectChange(ids[0]) : undefined)}
          placeholder="Choose a project"
          loading={projects.isLoading}
        />
        {body}
      </ScrollView>
      {editingHours ? (
        <WorkScheduleSheet
          key={editingHours.userId}
          member={editingHours}
          onClose={() => setEditingHours(null)}
        />
      ) : null}
      {editingState ? (
        <AvailabilitySheet
          key={editingState.userId}
          member={editingState}
          onClose={() => setEditingState(null)}
        />
      ) : null}
    </View>
  );
}
