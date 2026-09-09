import {
  PROJECT_MEMBER_ROLE,
  PROJECT_MEMBER_ROLE_LABELS,
  type ProjectMemberRole,
  type ProjectMemberSummary,
} from '@ashniva/types';
import { Button, FormField, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { WorkAreaPicker } from '../../tasks/components/WorkAreaPicker';
import { useProjectMutations } from '../api';

import './members.css';

const ROLES = Object.values(PROJECT_MEMBER_ROLE);

interface Draft {
  userId: string;
  role: ProjectMemberRole;
  responsibilities: string[];
  /** Only for the React key — a new row has no user yet, so the id cannot be the key. */
  key: string;
}

/**
 * Who is on this project and what each of them is responsible for.
 *
 * The endpoint behind this replaces the whole membership list in one call, so the modal edits a
 * draft and sends it once: a row-at-a-time UI over a whole-list endpoint would issue a write per
 * keystroke and leave the project half-edited if one of them failed.
 *
 * Responsibilities are only offered for the roles where they mean something. A team lead's job is
 * the project; a developer's is the API or the frontend, and that is what the support router later
 * matches a ticket against.
 */
const RESPONSIBILITY_ROLES: string[] = [
  PROJECT_MEMBER_ROLE.DEVELOPER,
  PROJECT_MEMBER_ROLE.LEAD,
  PROJECT_MEMBER_ROLE.TESTER,
];

export function ProjectMembersModal({
  projectId,
  members,
  onClose,
}: {
  projectId: string;
  members: ProjectMemberSummary[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft[]>(() =>
    members.map((member) => ({
      userId: member.id,
      role: member.role,
      responsibilities: member.responsibilities,
      key: member.id,
    })),
  );
  const { setMembers } = useProjectMutations(projectId);
  const { error, wrap } = useSubmitHandler(onClose);

  const update = (key: string, patch: Partial<Draft>) =>
    setDraft((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () =>
    setDraft((rows) => [
      ...rows,
      {
        userId: '',
        role: PROJECT_MEMBER_ROLE.DEVELOPER,
        responsibilities: [],
        key: `new-${rows.length}-${Date.now()}`,
      },
    ]);

  const remove = (key: string) => setDraft((rows) => rows.filter((row) => row.key !== key));

  // A row with nobody chosen is one the manager started and abandoned; dropping it is kinder than
  // refusing to save. Two rows for the same person would be rejected by the primary key, so the
  // last one entered wins — which is the one they were just looking at.
  const payload = () => {
    const byUser = new Map<string, Draft>();
    for (const row of draft) {
      if (row.userId) {
        byUser.set(row.userId, row);
      }
    }
    return [...byUser.values()].map((row) => ({
      userId: row.userId,
      role: row.role,
      responsibilities: RESPONSIBILITY_ROLES.includes(row.role) ? row.responsibilities : [],
    }));
  };

  return (
    <Modal
      open
      title="Project team"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={setMembers.isPending}
            onClick={() => void wrap(() => setMembers.mutateAsync(payload()))()}
          >
            Save team
          </Button>
        </>
      }
    >
      <div className="members-editor">
        {draft.length === 0 ? <p className="muted">Nobody is on this project yet.</p> : null}
        {draft.map((row) => (
          <div key={row.key} className="members-editor__row">
            <div className="members-editor__who">
              <FormField label="Person">
                <PeoplePicker
                  value={row.userId}
                  onChange={(userId) => update(row.key, { userId })}
                  placeholder="Choose someone"
                />
              </FormField>
              <FormField label="Role on this project">
                <Select
                  value={row.role}
                  onChange={(event) =>
                    update(row.key, { role: event.target.value as ProjectMemberRole })
                  }
                  options={ROLES.map((role) => ({
                    value: role,
                    label: PROJECT_MEMBER_ROLE_LABELS[role],
                  }))}
                />
              </FormField>
              <Button
                variant="danger"
                aria-label="Remove from project"
                onClick={() => remove(row.key)}
              >
                Remove
              </Button>
            </div>
            {RESPONSIBILITY_ROLES.includes(row.role) ? (
              <FormField
                label="Responsible for"
                hint="Used to route support for this area to the right person"
              >
                <WorkAreaPicker
                  value={row.responsibilities}
                  onChange={(responsibilities) => update(row.key, { responsibilities })}
                />
              </FormField>
            ) : null}
          </div>
        ))}
        <Button onClick={add}>Add someone</Button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
