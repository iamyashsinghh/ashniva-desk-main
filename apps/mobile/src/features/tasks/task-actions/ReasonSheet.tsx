import type { TaskDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { SheetButtons } from './SheetButtons';

export type ReasonKind = 'block' | 'reopen' | 'cancel';

const COPY: Record<
  ReasonKind,
  { title: string; subtitle: string; label: string; placeholder: string; confirm: string }
> = {
  block: {
    title: 'Mark as blocked',
    subtitle: 'The work cannot continue. Whoever picks this up reads the reason first.',
    label: 'What is blocking it?',
    placeholder: 'Waiting on the staging database credentials',
    confirm: 'Mark as blocked',
  },
  reopen: {
    title: 'Reopen this task',
    subtitle: 'It goes back to the assignee with your reason in its history.',
    label: 'Why is it being reopened?',
    placeholder: 'The fix does not cover the Safari case',
    confirm: 'Reopen',
  },
  cancel: {
    title: 'Cancel this task',
    subtitle: 'Nobody works on a cancelled task. This cannot be undone from here.',
    label: 'Reason',
    placeholder: 'Superseded by the new checkout flow',
    confirm: 'Cancel task',
  },
};

/** The three actions that take nothing but a reason: `TaskNoteDto`, at least three characters. */
export function ReasonSheet({
  task,
  kind,
  onClose,
  onDone,
}: {
  task: TaskDetail;
  kind: ReasonKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const copy = COPY[kind];
  const write = useApiMutation<{ reason: string }, TaskDetail>({
    path: `/tasks/${task.id}/${kind}`,
    body: (variables) => variables,
    invalidate: [['tasks']],
    onSuccess: onDone,
  });

  return (
    <Sheet
      visible
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={copy.confirm}
          confirmIcon={kind === 'reopen' ? 'refresh-outline' : 'ban-outline'}
          onConfirm={() => void write.run({ reason: reason.trim() })}
          onCancel={onClose}
          busy={write.busy}
          disabled={reason.trim().length < 3}
          danger={kind !== 'reopen'}
        />
      }
    >
      <Field label={copy.label} required hint="At least three characters">
        <Input
          accessibilityLabel={copy.label}
          autoFocus
          multiline
          numberOfLines={3}
          maxLength={1000}
          onChangeText={setReason}
          placeholder={copy.placeholder}
          style={{ minHeight: 88 }}
          value={reason}
        />
      </Field>
      {write.error ? (
        <Banner tone="danger" role="alert">
          {write.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
