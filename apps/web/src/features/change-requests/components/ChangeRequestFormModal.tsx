import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useContractsQuery } from '../../contracts/api';
import { useProjectsQuery } from '../../projects/api';
import { useOrganizationsQuery, useUsersQuery } from '../../users/api';
import { useChangeRequestMutations, type ChangeRequestInput } from '../api';

interface ChangeRequestFormModalProps {
  /** Portal callers raise for their own organization; staff pick the client. */
  portal?: boolean;
  existing?: {
    id: string;
    title: string;
    description: string;
    businessReason: string | null;
    scope: string | null;
    impact: string | null;
    project: { id: string } | null;
  };
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** Raise or edit a change request (the fields both sides may write). */
export function ChangeRequestFormModal({
  portal = false,
  existing,
  onClose,
  onSaved,
}: ChangeRequestFormModalProps) {
  const { create, update } = useChangeRequestMutations(existing?.id, portal);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    clientOrganizationId: '',
    requestedById: '',
    projectId: existing?.project?.id ?? '',
    contractId: '',
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    businessReason: existing?.businessReason ?? '',
    scope: existing?.scope ?? '',
    impact: existing?.impact ?? '',
  });
  const organizations = useOrganizationsQuery(!portal);
  const clientUsers = useUsersQuery(form.clientOrganizationId || undefined);
  const projects = useProjectsQuery({}, !portal);
  const contracts = useContractsQuery(
    { view: 'all', clientOrganizationId: form.clientOrganizationId || undefined },
    !portal && Boolean(form.clientOrganizationId),
  );
  const valid =
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 10 &&
    (portal || existing || form.clientOrganizationId);

  const save = async () => {
    const body: ChangeRequestInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      businessReason: form.businessReason.trim() || null,
      scope: form.scope.trim() || null,
      impact: form.impact.trim() || null,
      projectId: form.projectId || null,
      ...(portal || existing
        ? {}
        : {
            clientOrganizationId: form.clientOrganizationId,
            requestedById: form.requestedById || undefined,
            contractId: form.contractId || null,
          }),
    };
    const saved = existing ? await update.mutateAsync(body) : await create.mutateAsync(body);
    onSaved?.(saved.id);
  };
  const clientProjects = (projects.data ?? []).filter(
    (project) =>
      !form.clientOrganizationId || project.clientOrganization?.id === form.clientOrganizationId,
  );

  return (
    <Modal
      open
      size="lg"
      title={existing ? 'Edit change request' : 'Raise a change request'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="Title and a description of at least 10 characters are required"
            onClick={() => void wrap(save)()}
          >
            {existing ? 'Save' : 'Save draft'}
          </Button>
        </>
      }
    >
      <FormGrid>
        {!portal && !existing ? (
          <>
            <FormField label="Client" required>
              <Select
                value={form.clientOrganizationId}
                placeholder="Choose a client"
                onChange={(event) =>
                  setForm({
                    ...form,
                    clientOrganizationId: event.target.value,
                    requestedById: '',
                    projectId: '',
                    contractId: '',
                  })
                }
                options={(organizations.data ?? [])
                  .filter((organization) => !organization.isServiceProvider)
                  .map((organization) => ({ value: organization.id, label: organization.name }))}
              />
            </FormField>
            <FormField label="Requested by (client contact)">
              <Select
                value={form.requestedById}
                onChange={(event) => setForm({ ...form, requestedById: event.target.value })}
                options={[
                  { value: '', label: 'Me' },
                  ...(clientUsers.data ?? []).map((user) => ({ value: user.id, label: user.name })),
                ]}
              />
            </FormField>
            <FormField label="Contract">
              <Select
                value={form.contractId}
                onChange={(event) => setForm({ ...form, contractId: event.target.value })}
                options={[
                  { value: '', label: 'None' },
                  ...(contracts.data?.items ?? []).map((contract) => ({
                    value: contract.id,
                    label: `${contract.number} ${contract.title}`,
                  })),
                ]}
              />
            </FormField>
          </>
        ) : null}
        {!portal ? (
          <FormField label="Project">
            <Select
              value={form.projectId}
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              options={[
                { value: '', label: 'None' },
                ...clientProjects.map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
          </FormField>
        ) : null}
        <FormGridFull>
          <FormField label="Title" required>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="What should change" required>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Business reason">
            <Textarea
              rows={2}
              value={form.businessReason}
              onChange={(event) => setForm({ ...form, businessReason: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormField label="Scope">
          <Textarea
            rows={2}
            value={form.scope}
            onChange={(event) => setForm({ ...form, scope: event.target.value })}
          />
        </FormField>
        <FormField label="Impact">
          <Textarea
            rows={2}
            value={form.impact}
            onChange={(event) => setForm({ ...form, impact: event.target.value })}
          />
        </FormField>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
