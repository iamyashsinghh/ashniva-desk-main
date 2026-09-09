import { APPROVAL_ACTION, type ApprovalAction, type PortalApprovalDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';

/**
 * The client's answer.
 *
 * Three answers, and two of them the API requires a comment with — so the form asks for it before
 * the button is available rather than after the request comes back. Somebody rejecting a
 * milestone on a phone has the reason in their head; somebody told to go and add one writes "no".
 *
 * The decision is not a local judgement. Every one of these routes needs `approval:decide`, and
 * the API refuses the requester and the publisher deciding their own request even when they hold
 * it. This form is only drawn when the API said `canDecide`, and if that answer is stale the
 * refusal is shown here in the API's own words.
 */

type Decision = Extract<ApprovalAction, 'approve' | 'request-changes' | 'reject'>;

const DECISIONS: readonly SegmentOption<Decision>[] = [
  { value: APPROVAL_ACTION.APPROVE, label: 'Approve' },
  { value: APPROVAL_ACTION.REQUEST_CHANGES, label: 'Ask for changes' },
  { value: APPROVAL_ACTION.REJECT, label: 'Reject' },
];

const PROMPT: Record<Decision, { label: string; hint: string; button: string }> = {
  [APPROVAL_ACTION.APPROVE]: {
    label: 'Anything to add?',
    hint: 'Optional. Your team sees this alongside your approval.',
    button: 'Approve this',
  },
  [APPROVAL_ACTION.REQUEST_CHANGES]: {
    label: 'What needs to change?',
    hint: 'Required. This is what your team works from.',
    button: 'Ask for changes',
  },
  [APPROVAL_ACTION.REJECT]: {
    label: 'Why are you rejecting it?',
    hint: 'Required. Your team reads this first.',
    button: 'Reject this',
  },
};

export function ApprovalDecisionForm({
  approvalId,
  onDecided,
}: {
  approvalId: string;
  onDecided: () => void;
}) {
  const [decision, setDecision] = useState<Decision>(APPROVAL_ACTION.APPROVE);
  const [comment, setComment] = useState('');

  const decide = useApiMutation<{ decision: Decision }, PortalApprovalDetail>({
    path: (variables) => `/portal/approvals/${approvalId}/${variables.decision}`,
    body: () => (comment.trim() ? { comment: comment.trim() } : {}),
    invalidate: [
      ['portal', 'approvals', approvalId],
      ['portal', 'approvals'],
      ['portal', 'home'],
    ],
    onSuccess: () => {
      setComment('');
      onDecided();
    },
  });

  const prompt = PROMPT[decision];
  const commentRequired = decision !== APPROVAL_ACTION.APPROVE;
  const valid = !commentRequired || comment.trim().length >= 3;

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Your decision
      </AppText>

      <Segmented
        options={DECISIONS}
        value={decision}
        onChange={setDecision}
        label="What you want to do"
      />

      <Field label={prompt.label} hint={prompt.hint}>
        <Input
          accessibilityLabel={prompt.label}
          multiline
          numberOfLines={3}
          onChangeText={setComment}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          value={comment}
        />
      </Field>

      {decide.error ? (
        <AppText tone="danger" size="sm">
          {decide.error}
        </AppText>
      ) : null}

      <Button
        label={prompt.button}
        loading={decide.busy}
        disabled={!valid}
        accessibilityHint="Sends your answer to your team. This cannot be taken back from here."
        onPress={() => void decide.run({ decision })}
      />
      {!valid ? (
        <AppText size="xs" tone="faint">
          Say what you want changed before sending this.
        </AppText>
      ) : null}
    </Card>
  );
}
