import type { TeamSummary, UserSummary } from '@ashniva/types';
import { Alert, Button, EmptyState, FormField, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTeamMutations } from '../../users/api';

interface TeamsPanelProps {
  teams: TeamSummary[];
  people: UserSummary[];
}

/** Teams with lead and members; create a team or replace its members. */
export function TeamsPanel({ teams, people }: TeamsPanelProps) {
  const [editing, setEditing] = useState<TeamSummary | 'new' | null>(null);
  return (
    <div className="update-list">
      {teams.length === 0 ? <EmptyState title="No teams yet" /> : null}
      {teams.map((team) => (
        <div
          key={team.id}
          className="update-list__item"
          style={{ padding: 10, borderRadius: 6, background: 'var(--color-surface-muted)' }}
        >
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{team.name}</strong>
            <Button size="sm" onClick={() => setEditing(team)}>
              Members
            </Button>
          </span>
          <span className="update-list__meta">
            Lead: {team.lead?.name ?? '—'} · {team.members.length} members
            {team.description ? ` · ${team.description}` : ''}
          </span>
          <span className="muted">
            {team.members.map((member) => member.name).join(', ') || 'No members yet'}
          </span>
        </div>
      ))}
      <div>
        <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
          + New team
        </Button>
      </div>
      {editing ? (
        <TeamModal
          team={editing === 'new' ? undefined : editing}
          people={people}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TeamModal({
  team,
  people,
  onClose,
}: {
  team?: TeamSummary;
  people: UserSummary[];
  onClose: () => void;
}) {
  const { create, setMembers } = useTeamMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [name, setName] = useState(team?.name ?? '');
  const [leadUserId, setLeadUserId] = useState(team?.lead?.id ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(
    team?.members.map((member) => member.id) ?? [],
  );
  const save = () =>
    team
      ? setMembers.mutateAsync({ id: team.id, userIds: memberIds })
      : create.mutateAsync({ name: name.trim(), leadUserId: leadUserId || undefined, memberIds });
  return (
    <Modal
      open
      title={team ? `${team.name} · members` : 'New team'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || setMembers.isPending}
            disabled={!team && name.trim().length < 2}
            disabledReason="Enter a team name"
            onClick={() => void wrap(save)()}
          >
            Save
          </Button>
        </>
      }
    >
      {!team ? (
        <>
          <FormField label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField label="Lead">
            <Select
              value={leadUserId}
              onChange={(event) => setLeadUserId(event.target.value)}
              options={[
                { value: '', label: 'No lead yet' },
                ...people.map((person) => ({ value: person.id, label: person.name })),
              ]}
            />
          </FormField>
        </>
      ) : null}
      <FormField label="Members" hint="Hold Ctrl / Cmd to select several">
        <Select
          multiple
          size={Math.min(8, Math.max(3, people.length))}
          value={memberIds}
          onChange={(event) =>
            setMemberIds(Array.from(event.target.selectedOptions).map((option) => option.value))
          }
          options={people.map((person) => ({
            value: person.id,
            label: `${person.name} · ${person.roleName}`,
          }))}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
