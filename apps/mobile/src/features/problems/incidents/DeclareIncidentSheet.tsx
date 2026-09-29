import {
  PRIORITY,
  type CreateIncidentInput,
  type IncidentDetail,
  type Priority,
  type ProblemDetail,
} from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { ProjectPicker, UserPicker } from '../../../shared/components/pickers';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { SeverityField } from '../components/SeverityField';
import { useIncidentWrite } from '../problem-api';
import { ProblemPicker } from './ProblemPicker';

const MIN_TEXT = 3;

/**
 * Declaring an incident: something is broken right now.
 *
 * Opened from a problem, it is tied to that problem and its project from the start — the only
 * moment the link can be made, since `PATCH /incidents/:id` does not take a problem. Opened from
 * the list, the recurring fault behind it can be chosen here for the same reason.
 */
export function DeclareIncidentSheet({
  problem,
  onClose,
  onCreated,
}: {
  problem?: ProblemDetail;
  onClose: () => void;
  onCreated: (incident: IncidentDetail) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Priority>(PRIORITY.HIGH);
  const [impact, setImpact] = useState('');
  const [projectId, setProjectId] = useState<string | null>(problem?.project?.id ?? null);
  const [problemId, setProblemId] = useState<string | null>(problem?.id ?? null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const declare = useIncidentWrite<CreateIncidentInput>({
    path: '/incidents',
    body: (input) => input,
    onDone: onCreated,
  });

  const valid = title.trim().length >= MIN_TEXT && description.trim().length >= MIN_TEXT;
  const submit = () =>
    void declare.run({
      title: title.trim(),
      description: description.trim(),
      severity,
      ...(impact.trim() ? { impact: impact.trim() } : {}),
      ...(projectId ? { projectId } : {}),
      ...(problemId ? { problemId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(startedAt ? { startedAt } : {}),
    });

  return (
    <Sheet
      visible
      title="Declare an incident"
      subtitle={problem ? `Caused by ${problem.key} · ${problem.title}` : 'Something is broken now'}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Declare"
            icon="flame-outline"
            variant="danger"
            loading={declare.busy}
            disabled={!valid}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Title" required>
        <Input
          accessibilityLabel="Title"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder="Checkout returns 500 for every client"
        />
      </Field>
      <Field label="What is broken" required hint="In as much detail as is known">
        <Input
          accessibilityLabel="What is broken"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={10000}
          style={{ minHeight: 104 }}
        />
      </Field>
      <SeverityField value={severity} onChange={setSeverity} />
      <Field label="Impact" hint="Who is affected and how">
        <Input
          accessibilityLabel="Impact"
          value={impact}
          onChangeText={setImpact}
          multiline
          numberOfLines={2}
          maxLength={2000}
          style={{ minHeight: 72 }}
        />
      </Field>
      <ProjectPicker
        value={projectId}
        onChange={setProjectId}
        allowClear
        placeholder="No project"
      />
      {problem ? null : <ProblemPicker value={problemId} onChange={setProblemId} />}
      <UserPicker
        label="Owner"
        value={ownerId ? [ownerId] : []}
        onChange={(ids) => setOwnerId(ids[0] ?? null)}
        placeholder="Unassigned"
      />
      <DateTimeField
        label="Impact began"
        mode="datetime"
        value={startedAt}
        onChange={setStartedAt}
        placeholder="Now"
        hint="Only if it is known to be earlier than now"
      />
      {declare.error ? (
        <Banner tone="danger" role="alert">
          {declare.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
