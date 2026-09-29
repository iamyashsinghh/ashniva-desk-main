import { PRIORITY, type Priority, type ProblemDetail } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { ProjectPicker, UserPicker } from '../../shared/components/pickers';
import { Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { SeverityField } from './components/SeverityField';
import { useProblemWrite } from './problem-api';

/** What a new problem starts from — blank, or a recurring-issues row being promoted. */
export interface ProblemDraft {
  title?: string;
  description?: string;
  severity?: Priority;
  module?: string;
  productId?: string;
  projectId?: string;
}

const TITLE_MIN = 3;

/**
 * Opening a problem, or editing one.
 *
 * Title, description, severity and module are the fields `PATCH /problems/:id` takes; the owner
 * is only offered when editing, because a new problem's owner is named when the RCA is asked for.
 * The project is only chosen on creation — the server fills it from the first linked ticket
 * otherwise, and does not accept it on an edit.
 */
export function ProblemFormSheet({
  problem,
  draft,
  onClose,
  onSaved,
}: {
  /** The problem being edited. Omit to open a new one. */
  problem?: ProblemDetail;
  draft?: ProblemDraft;
  onClose: () => void;
  onSaved: (problem: ProblemDetail) => void;
}) {
  const editing = Boolean(problem);
  const [title, setTitle] = useState(problem?.title ?? draft?.title ?? '');
  const [description, setDescription] = useState(problem?.description ?? draft?.description ?? '');
  const [severity, setSeverity] = useState<Priority>(
    problem?.severity ?? draft?.severity ?? PRIORITY.HIGH,
  );
  const [module, setModule] = useState(problem?.module ?? draft?.module ?? '');
  const [projectId, setProjectId] = useState<string | null>(draft?.projectId ?? null);
  const [ownerId, setOwnerId] = useState<string | null>(problem?.owner?.id ?? null);

  const save = useProblemWrite<void>({
    path: problem ? `/problems/${problem.id}` : '/problems',
    method: problem ? 'PATCH' : 'POST',
    body: () => ({
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      severity,
      ...(module.trim() ? { module: module.trim() } : {}),
      ...(problem ? { ownerId } : {}),
      ...(!problem && projectId ? { projectId } : {}),
      ...(!problem && draft?.productId ? { productId: draft.productId } : {}),
    }),
    onDone: onSaved,
  });

  return (
    <Sheet
      visible
      title={editing ? 'Edit problem' : 'New problem'}
      subtitle="Internal — no client ever sees a problem"
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={editing ? 'Save' : 'Open problem'}
            icon="checkmark"
            loading={save.busy}
            disabled={title.trim().length < TITLE_MIN}
            onPress={() => void save.run()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Title" required hint="The fault, in the words a support executive would search">
        <Input
          accessibilityLabel="Title"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder="Invoice PDF fails to render"
        />
      </Field>
      <Field label="Description">
        <Input
          accessibilityLabel="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={10000}
          style={{ minHeight: 104 }}
        />
      </Field>
      <SeverityField value={severity} onChange={setSeverity} />
      <Field label="Module" hint="The area of the product, as tickets name it">
        <Input accessibilityLabel="Module" value={module} onChangeText={setModule} maxLength={80} />
      </Field>
      {editing ? (
        <UserPicker
          label="Owner"
          value={ownerId ? [ownerId] : []}
          onChange={(ids) => setOwnerId(ids[0] ?? null)}
          placeholder="Nobody yet"
        />
      ) : (
        <ProjectPicker
          value={projectId}
          onChange={setProjectId}
          allowClear
          placeholder="Taken from the first linked ticket"
        />
      )}
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
