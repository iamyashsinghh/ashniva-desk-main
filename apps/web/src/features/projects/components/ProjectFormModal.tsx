import {
  PROJECT_STATUS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE,
  PROJECT_TYPE_LABELS,
  ROLE_KEYS,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectType,
} from '@ashniva/types';
import { Button, FormField, Input, Modal, Select, Switch, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useCurrentUser } from '../../auth/session-context';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { PROJECT_MANAGER_ROLES, TEAM_LEAD_ROLES } from '../../tasks/components/people-roles';
import { useOrganizationsQuery, useTeamsQuery } from '../../users/api';
import { useProjectMutations, type ProjectInput } from '../api';

/** Matches the API: 2–8 letters/digits, first character a letter. Hyphens are the task separator. */
const PROJECT_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,7}$/;

function sanitizeProjectCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
  /** Editing an existing project; omit to create. */
  project?: ProjectSummary;
}

/** Create / edit project: code, name, client, type, status, manager, lead, team, dates, UAT. */
export function ProjectFormModal({ open, onClose, onSaved, project }: ProjectFormModalProps) {
  const me = useCurrentUser();
  const organizations = useOrganizationsQuery();
  const teams = useTeamsQuery();
  const { create, update } = useProjectMutations(project?.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState<ProjectInput>({
    code: project?.code ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    type: project?.type ?? PROJECT_TYPE.FIXED_PRICE,
    status: project?.status ?? PROJECT_STATUS.ACTIVE,
    clientOrganizationId: project?.clientOrganization?.id ?? '',
    managerUserId: project?.manager?.id ?? (me.roleKey === ROLE_KEYS.PROJECT_MANAGER ? me.id : ''),
    leadUserId: project?.lead?.id ?? (me.roleKey === ROLE_KEYS.TEAM_LEAD ? me.id : ''),
    teamId: project?.team?.id ?? '',
    startDate: project?.startDate ?? '',
    targetDate: project?.targetDate ?? '',
    requiresClientUat: project?.requiresClientUat ?? false,
  });
  const set = <TKey extends keyof ProjectInput>(key: TKey, value: ProjectInput[TKey]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const code = sanitizeProjectCode(form.code);
  const codeValid = PROJECT_CODE_PATTERN.test(code);
  const nameValid = form.name.trim().length >= 2;
  const teamValid = Boolean(form.teamId);
  const leadValid = Boolean(form.leadUserId);
  const valid = codeValid && nameValid && teamValid && leadValid;
  const pending = create.isPending || update.isPending;
  const codeError =
    code.length > 0 && !codeValid
      ? '2–8 letters or digits, starting with a letter. Hyphens are stripped — tasks become CODE-1.'
      : undefined;

  const save = () => {
    const body: ProjectInput = {
      ...form,
      code,
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      clientOrganizationId: form.clientOrganizationId || null,
      managerUserId: form.managerUserId || null,
      leadUserId: form.leadUserId || null,
      teamId: form.teamId || null,
      startDate: form.startDate || null,
      targetDate: form.targetDate || null,
    };
    if (project) {
      const { code: _code, ...rest } = body;
      return update.mutateAsync(rest).then(onSaved);
    }
    return create.mutateAsync(body).then(onSaved);
  };

  return (
    <Modal
      open={open}
      title={project ? `Edit project · ${project.name}` : 'New project'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!valid}
            disabledReason={
              !codeValid
                ? 'Code must be 2–8 letters or digits (no hyphen), starting with a letter'
                : !nameValid
                  ? 'Name must be at least 2 characters'
                  : !leadValid
                    ? 'Choose who will lead this team'
                    : 'Choose which team this project belongs to'
            }
            onClick={() => void wrap(save)()}
          >
            {project ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <FormField
          label="Code"
          required
          hint="Letters and digits only, 2–8 characters. If you type ACM, tasks become ACM-1, ACM-2."
          error={codeError}
        >
          <Input
            value={code}
            placeholder="ACM"
            onChange={(event) => set('code', sanitizeProjectCode(event.target.value))}
            disabled={Boolean(project)}
            maxLength={8}
          />
        </FormField>
        <FormField label="Name" required>
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
        </FormField>
        <FormField label="Client" hint="Leave empty for an internal project">
          <Select
            value={form.clientOrganizationId ?? ''}
            onChange={(event) => set('clientOrganizationId', event.target.value)}
            options={[
              { value: '', label: 'Internal (no client)' },
              ...(organizations.data ?? [])
                .filter((organization) => !organization.isServiceProvider)
                .map((organization) => ({ value: organization.id, label: organization.name })),
            ]}
          />
        </FormField>
        <FormField label="Type">
          <Select
            value={form.type}
            onChange={(event) => set('type', event.target.value as ProjectType)}
            options={Object.values(PROJECT_TYPE).map((type) => ({
              value: type,
              label: PROJECT_TYPE_LABELS[type],
            }))}
          />
        </FormField>
        <FormField label="Status">
          <Select
            value={form.status ?? PROJECT_STATUS.ACTIVE}
            onChange={(event) => set('status', event.target.value as ProjectStatus)}
            options={Object.values(PROJECT_STATUS).map((status) => ({
              value: status,
              label: PROJECT_STATUS_LABELS[status],
            }))}
          />
        </FormField>
        <FormField
          label="Who will lead this team"
          required
          hint="Only people whose role is Team Lead / Senior Developer."
        >
          <PeoplePicker
            value={form.leadUserId ?? ''}
            onChange={(userId) => set('leadUserId', userId)}
            roles={TEAM_LEAD_ROLES}
            placeholder="Select a team lead"
          />
        </FormField>
        <FormField
          label="Team"
          required
          hint="Developers and testers on this team see the project. Nobody else does, except Super Admin."
        >
          <Select
            value={form.teamId ?? ''}
            onChange={(event) => set('teamId', event.target.value)}
            options={[
              { value: '', label: 'Select a team' },
              ...(teams.data ?? []).map((team) => ({ value: team.id, label: team.name })),
            ]}
          />
        </FormField>
        <FormField label="Project manager" hint="Only people whose role is Project Manager.">
          <PeoplePicker
            value={form.managerUserId ?? ''}
            onChange={(userId) => set('managerUserId', userId)}
            roles={PROJECT_MANAGER_ROLES}
            placeholder="Not set"
          />
        </FormField>
        <FormField label="Start date">
          <Input
            type="date"
            value={form.startDate ?? ''}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </FormField>
        <FormField label="Target delivery">
          <Input
            type="date"
            value={form.targetDate ?? ''}
            onChange={(event) => set('targetDate', event.target.value)}
          />
        </FormField>
        <div className="form-grid__full">
          <FormField label="Description">
            <Textarea
              rows={3}
              value={form.description ?? ''}
              onChange={(event) => set('description', event.target.value)}
            />
          </FormField>
        </div>
        <div className="form-grid__full">
          <Switch
            checked={form.requiresClientUat ?? false}
            onChange={(checked) => set('requiresClientUat', checked)}
            label="Client UAT required"
            description="Used by the release pipeline in Phase 2; recorded now so nothing is lost."
          />
        </div>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
