import { PERMISSIONS, type EffectiveAvailability } from '@ashniva/types';
import { useMemo, useState, type ReactNode } from 'react';

import { errorMessage, isOffline } from '../../../shared/api/client';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useSession } from '../../auth/SessionProvider';
import { useActiveProjects, useSupportConfig } from '../../support-queue/api';
import { AvailabilitySheet } from '../../support-queue/AvailabilitySheet';
import { OnCallSection } from '../../support-queue/OnCallSection';
import { TeamMemberCard } from '../../support-queue/TeamMemberCard';
import { WorkScheduleSheet } from '../../support-queue/WorkScheduleSheet';
import { FeedbackBanner, NoAccess, SettingsScroll, type Feedback } from '../shared/SettingsLayout';
import { OwnershipSheet } from './OwnershipSheet';
import { OwnershipSummary } from './OwnershipSummary';

type RoutingView = 'ownership' | 'team' | 'on-call';

const VIEWS = [
  { value: 'ownership' as const, label: 'Ownership', icon: 'shield-checkmark-outline' as const },
  { value: 'team' as const, label: 'Team', icon: 'people-outline' as const },
  { value: 'on-call' as const, label: 'On call', icon: 'call-outline' as const },
];

/**
 * Admin → Support routing: who covers a project, when they work, and who is available now.
 *
 * One project at a time, as on the web, because every one of these records is per project or per
 * person on it. The team and on-call pieces are the support queue's own — the same sheets, the same
 * endpoints — so a rota edited here and one edited from the queue are the same edit. Everything
 * needs `support-routing:manage`; without it nothing is fetched.
 */
export function SupportRoutingScreen() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const projects = useActiveProjects(canManage);
  const [projectId, setProjectId] = useState<string | null>(null);
  const chosen = projectId ?? projects.data?.[0]?.id ?? null;
  const config = useSupportConfig(chosen, canManage);
  const [view, setView] = useState<RoutingView>('ownership');
  const [editingOwnership, setEditingOwnership] = useState(false);
  const [editingHours, setEditingHours] = useState<EffectiveAvailability | null>(null);
  const [editingState, setEditingState] = useState<EffectiveAvailability | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const options = useMemo(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
        icon: 'folder-open-outline' as const,
      })),
    [projects.data],
  );

  if (!canManage) {
    return (
      <NoAccess description="Configuring support ownership and working hours needs the support-routing permission." />
    );
  }

  let body: ReactNode;
  if (projects.isLoading || config.isLoading) {
    body = <LoadingState label="Loading the project's support" variant="spinner" />;
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
        description="Support ownership, working hours and on-call cover are set per project."
      />
    );
  } else if (view === 'ownership') {
    body = (
      <OwnershipSummary
        ownership={config.data.ownership}
        team={config.data.team}
        onEdit={() => setEditingOwnership(true)}
      />
    );
  } else if (view === 'team') {
    body =
      config.data.team.length === 0 ? (
        <EmptyState icon="people-outline" title="This project has no members yet" />
      ) : (
        config.data.team.map((member) => (
          <TeamMemberCard
            key={member.userId}
            member={member}
            onEditSchedule={() => setEditingHours(member)}
            onEditAvailability={() => setEditingState(member)}
          />
        ))
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
    <>
      <SettingsScroll refreshing={config.isRefetching} onRefresh={() => config.refetch()}>
        <AppText size="sm" tone="muted">
          Who covers this project's support, when they work, and who is available right now. Routing
          reads these three separately.
        </AppText>
        <SelectField
          label="Project"
          icon="folder-outline"
          options={options}
          value={chosen ? [chosen] : []}
          onChange={(ids) => {
            if (ids[0]) {
              setProjectId(ids[0]);
              setFeedback(null);
            }
          }}
          placeholder="Choose a project"
          loading={projects.isLoading}
        />
        <Segmented label="Support routing views" options={VIEWS} value={view} onChange={setView} />
        <FeedbackBanner feedback={feedback} />
        {body}
      </SettingsScroll>
      {editingOwnership && chosen && config.data ? (
        <OwnershipSheet
          projectId={chosen}
          ownership={config.data.ownership}
          team={config.data.team}
          onClose={() => setEditingOwnership(false)}
          onSaved={() => {
            setEditingOwnership(false);
            setFeedback({ tone: 'success', message: 'Support ownership saved.' });
          }}
        />
      ) : null}
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
    </>
  );
}
