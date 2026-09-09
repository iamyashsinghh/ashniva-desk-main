import { PERMISSIONS, type EffectiveAvailability } from '@ashniva/types';
import { EmptyState, FormField, PageHeader, Select } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useProjectsQuery } from '../../projects/api';
import { useSupportConfigQuery, useSupportRoutingMutations } from '../api';
import { AvailabilityModal } from '../components/AvailabilityModal';
import { OnCallCard } from '../components/OnCallCard';
import { SupportOwnershipCard } from '../components/SupportOwnershipCard';
import { TeamAvailabilityCard } from '../components/TeamAvailabilityCard';
import { WorkScheduleModal } from '../components/WorkScheduleModal';

import '../../dashboard/dashboard.css';
import '../support-routing.css';

/**
 * Admin → Support routing: who covers a project, when they work, and who is available now.
 *
 * One project at a time, because every one of these records is per project or per person on it.
 * The screen is gated on `support-routing:manage`, which Super Admin, Project Manager and Team
 * Lead hold; a developer has none of it and sees their own hours on their profile instead.
 */
export function SupportConfigPage() {
  const canManage = usePermission(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const projects = useProjectsQuery({ status: 'ACTIVE' }, canManage);
  const [projectId, setProjectId] = useState('');
  const [editingSchedule, setEditingSchedule] = useState<EffectiveAvailability | null>(null);
  const [editingAvailability, setEditingAvailability] = useState<EffectiveAvailability | null>(
    null,
  );

  const chosen = projectId || projects.data?.[0]?.id || '';
  const config = useSupportConfigQuery(chosen, canManage);
  const mutations = useSupportRoutingMutations(chosen);

  if (!canManage) {
    return (
      <div className="dashboard">
        <PageHeader title="Support routing" />
        <EmptyState
          title="Not available"
          description="Configuring support ownership and working hours needs the support-routing permission."
        />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Support routing"
        subtitle="Who covers this project's support, when they work, and who is available right now. Routing reads these three separately."
      />

      <FormField label="Project">
        <Select
          options={(projects.data ?? []).map((project) => ({
            value: project.id,
            label: `${project.code} · ${project.name}`,
          }))}
          placeholder="Choose a project"
          value={chosen}
          onChange={(event) => setProjectId(event.target.value)}
        />
      </FormField>

      <QueryState
        isLoading={config.isLoading}
        isError={config.isError}
        error={config.error}
        onRetry={() => void config.refetch()}
      >
        {config.data ? (
          <div className="dashboard__grid dashboard__grid--equal">
            <SupportOwnershipCard
              key={chosen}
              ownership={config.data.ownership}
              team={config.data.team}
              onSave={(input) => mutations.saveOwnership.mutateAsync(input)}
            />
            <TeamAvailabilityCard
              team={config.data.team}
              onEditSchedule={setEditingSchedule}
              onEditAvailability={setEditingAvailability}
            />
            <OnCallCard
              onCall={config.data.onCall}
              team={config.data.team}
              onSet={(input) => mutations.setOnCall.mutateAsync(input)}
              onClear={(onDate) => mutations.clearOnCall.mutateAsync(onDate)}
            />
          </div>
        ) : null}
      </QueryState>

      {editingSchedule ? (
        <WorkScheduleModal
          member={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSave={(input) =>
            mutations.saveSchedule.mutateAsync({ userId: editingSchedule.userId, input })
          }
        />
      ) : null}
      {editingAvailability ? (
        <AvailabilityModal
          member={editingAvailability}
          onClose={() => setEditingAvailability(null)}
          onSave={(input) =>
            mutations.setAvailability.mutateAsync({ userId: editingAvailability.userId, input })
          }
        />
      ) : null}
    </div>
  );
}
