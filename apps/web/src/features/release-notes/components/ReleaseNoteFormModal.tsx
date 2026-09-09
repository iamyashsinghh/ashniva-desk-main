import { Alert, Button, FormField, FormGrid, Input, Modal, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { todayIso } from '../../../shared/lib/format';
import { useProjectsQuery } from '../../projects/api';
import { useReleaseNoteMutations, type CreateReleaseNoteInput } from '../api';

interface ReleaseNoteFormModalProps {
  existing?: {
    id: string;
    version: string;
    releaseDate: string;
    clientSummary: string | null;
    internalNotes: string | null;
  };
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** Start or edit a release note. The project is fixed once the note exists. */
export function ReleaseNoteFormModal({ existing, onClose, onSaved }: ReleaseNoteFormModalProps) {
  const { create, update } = useReleaseNoteMutations(existing?.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    projectId: '',
    version: existing?.version ?? '',
    releaseDate: existing?.releaseDate ?? todayIso(),
    clientSummary: existing?.clientSummary ?? '',
    internalNotes: existing?.internalNotes ?? '',
  });
  const projects = useProjectsQuery({}, !existing);

  // Only projects that have a client: a release note is a document addressed to one.
  const clientProjects = (projects.data ?? []).filter((project) => project.clientOrganization);
  const valid = form.version.trim().length > 0 && (Boolean(existing) || Boolean(form.projectId));

  const save = async () => {
    const body = {
      version: form.version.trim(),
      releaseDate: form.releaseDate,
      clientSummary: form.clientSummary.trim(),
      internalNotes: form.internalNotes.trim(),
    };
    const saved = existing
      ? await update.mutateAsync(body)
      : await create.mutateAsync({ ...body, projectId: form.projectId } as CreateReleaseNoteInput);
    onSaved?.(saved.id);
  };

  return (
    <Modal
      open
      size="lg"
      title={existing ? 'Edit release note' : 'New release note'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="Pick a project and give the release a version"
            onClick={() => void wrap(save)()}
          >
            {existing ? 'Save' : 'Create draft'}
          </Button>
        </>
      }
    >
      <FormGrid>
        {existing ? null : (
          <FormField label="Project" required>
            <Select
              value={form.projectId}
              placeholder="Choose a project"
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              options={clientProjects.map((project) => ({
                value: project.id,
                label: `${project.code} — ${project.name}`,
              }))}
            />
          </FormField>
        )}
        <FormField label="Version" required hint="Shown to the client, e.g. 2026.09.1">
          <Input
            value={form.version}
            onChange={(event) => setForm({ ...form, version: event.target.value })}
          />
        </FormField>
        <FormField label="Release date" required>
          <Input
            type="date"
            value={form.releaseDate}
            onChange={(event) => setForm({ ...form, releaseDate: event.target.value })}
          />
        </FormField>
        <FormField label="Summary for the client" hint="Opens the published note">
          <Textarea
            rows={3}
            value={form.clientSummary}
            onChange={(event) => setForm({ ...form, clientSummary: event.target.value })}
          />
        </FormField>
        <FormField label="Internal notes" hint="Never shown to the client">
          <Textarea
            rows={3}
            value={form.internalNotes}
            onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
          />
        </FormField>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </FormGrid>
    </Modal>
  );
}
