import type { AddWorkPlanWorkInput, Priority, ProjectWorkPlan } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { AssigneeField, PriorityField } from './AssignmentFields';

const MIN_PROMPT = 8;

/**
 * "Add work with AI": describe the extra work, optionally pick who and how urgent. The model reads
 * the plan, chooses the right phase (or opens one) and fills steps and times; the server saves it.
 */
export function AddWorkSheet({
  plan,
  visible,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  plan: ProjectWorkPlan;
  visible: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** Resolves true when the work was added, so the sheet can clear and close. */
  onSubmit: (input: AddWorkPlanWorkInput) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState('');
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const ready = prompt.trim().length >= MIN_PROMPT;

  const submit = async () => {
    if (!ready) {
      return;
    }
    if (await onSubmit({ prompt: prompt.trim(), assignedToId, priority })) {
      setPrompt('');
      setAssignedToId(null);
      setPriority(null);
      onClose();
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Add work with AI"
      subtitle="AI reads this summary, picks the right phase (or opens a new one), and fills related steps and times."
      onClose={busy ? () => undefined : onClose}
      footer={
        <View style={{ flex: 1 }}>
          <Button
            label="Add with AI"
            icon="sparkles-outline"
            loading={busy}
            disabled={!ready}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <Field
        label="What should we add?"
        required
        hint="Example: OTP login, session timeout and a forgot-password email."
      >
        <Input
          multiline
          value={prompt}
          onChangeText={setPrompt}
          editable={!busy}
          placeholder="Describe the extra work"
          style={{ minHeight: 100 }}
        />
      </Field>
      {prompt.length > 0 && !ready ? (
        <AppText size="xs" tone="faint">
          Write at least a short description of the work.
        </AppText>
      ) : null}
      <AssigneeField
        label="Developer"
        developers={plan.developers}
        value={assignedToId}
        inherited={plan.assignedTo}
        clearLabel="Unassigned"
        disabled={busy}
        onChange={setAssignedToId}
      />
      <PriorityField
        value={priority}
        inherited={plan.priority}
        allowEmpty
        disabled={busy}
        onChange={setPriority}
      />
    </Sheet>
  );
}
