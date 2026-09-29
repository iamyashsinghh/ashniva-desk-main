import type { ProjectSummary, ReleaseNoteDetail } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { Sheet } from '../../shared/components/Sheet';
import { todayIsoDate } from '../../shared/format/format';
import { SheetButtons } from '../releases/SheetButtons';
import { RELEASE_NOTE_INVALIDATES } from './release-note-api';
import { noteVersionProblem } from './release-note-display';

interface NoteForm {
  projectId: string | null;
  version: string;
  releaseDate: string | null;
  clientSummary: string;
  internalNotes: string;
}

/**
 * Start or edit a release note. The project is fixed once the note exists, and only projects with
 * a client are offered: a release note is a document addressed to one client.
 */
export function ReleaseNoteFormSheet({
  existing,
  onClose,
  onSaved,
}: {
  existing?: ReleaseNoteDetail;
  onClose: () => void;
  onSaved?: (noteId: string) => void;
}) {
  const [form, setForm] = useState<NoteForm>({
    projectId: null,
    version: existing?.version ?? '',
    releaseDate: existing?.releaseDate.slice(0, 10) ?? todayIsoDate(),
    clientSummary: existing?.clientSummary ?? '',
    internalNotes: existing?.internalNotes ?? '',
  });
  const set = <K extends keyof NoteForm>(key: K, value: NoteForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const projects = useResource<ProjectSummary[]>(['projects'], '/projects', {
    enabled: !existing,
  });
  const projectOptions = useMemo<SelectOption[]>(
    () =>
      (projects.data ?? [])
        .filter((project) => project.clientOrganization)
        .map((project) => ({
          value: project.id,
          label: `${project.code} — ${project.name}`,
          description: project.clientOrganization?.name ?? '',
          icon: 'folder-open-outline',
          iconTone: 'teal',
        })),
    [projects.data],
  );

  const save = useApiMutation<NoteForm, ReleaseNoteDetail>({
    path: existing ? `/release-notes/${existing.id}` : '/release-notes',
    method: existing ? 'PATCH' : 'POST',
    body: (values) => ({
      ...(existing ? {} : { projectId: values.projectId }),
      version: values.version.trim(),
      releaseDate: values.releaseDate,
      clientSummary: values.clientSummary.trim(),
      internalNotes: values.internalNotes.trim(),
    }),
    invalidate: RELEASE_NOTE_INVALIDATES,
    onSuccess: (note) => {
      onClose();
      onSaved?.(note.id);
    },
  });

  const badVersion = noteVersionProblem(form.version);
  const valid =
    form.version.trim().length > 0 &&
    !badVersion &&
    Boolean(form.releaseDate) &&
    (Boolean(existing) || Boolean(form.projectId));

  return (
    <Sheet
      visible
      title={existing ? 'Edit release note' : 'New release note'}
      {...(existing ? { subtitle: `${existing.projectCode} ${existing.version}` } : {})}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetButtons
          confirmLabel={existing ? 'Save' : 'Create draft'}
          confirmIcon={existing ? 'checkmark' : 'add'}
          busy={save.busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void save.run(form)}
        />
      }
    >
      {existing ? null : (
        <SelectField
          label="Project"
          icon="folder-outline"
          required
          options={projectOptions}
          value={form.projectId ? [form.projectId] : []}
          onChange={(ids) => set('projectId', ids[0] ?? null)}
          placeholder="Choose a project"
          loading={projects.isLoading}
          hint="Only projects with a client — the note is addressed to them"
        />
      )}
      <Field label="Version" required hint="Shown to the client, e.g. 2026.09.1" error={badVersion}>
        <Input
          accessibilityLabel="Version"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="2026.09.1"
          value={form.version}
          invalid={Boolean(badVersion)}
          onChangeText={(value) => set('version', value)}
        />
      </Field>
      <DateTimeField
        label="Release date"
        required
        allowClear={false}
        value={form.releaseDate}
        onChange={(value) => set('releaseDate', value)}
      />
      <Field
        label="Summary for the client"
        hint="The client reads this — it opens the published note."
      >
        <Input
          accessibilityLabel="Summary for the client"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={form.clientSummary}
          onChangeText={(value) => set('clientSummary', value)}
        />
      </Field>
      <Field label="Internal notes" hint="Internal — never shown to the client.">
        <Input
          accessibilityLabel="Internal notes"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={form.internalNotes}
          onChangeText={(value) => set('internalNotes', value)}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
