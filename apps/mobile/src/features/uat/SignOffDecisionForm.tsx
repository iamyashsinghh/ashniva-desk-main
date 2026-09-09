import { PERMISSIONS, UAT_DECISION, type UatDecision, type UatRequestDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { usePermission } from '../auth/SessionProvider';

/**
 * The client's answer to a sign-off, and the question they can ask before giving one.
 *
 * Two forms rather than one, because they are two different acts. A question is cheap and anybody
 * at the client may ask it (`project:read`); an answer is final in the sense that matters — it
 * releases work, or it sends a team back to it — and needs `uat:decide`.
 *
 * `usePermission` here is the one thing the device decides, and only about *which form to draw*.
 * The API holds the requirement on the route and re-checks the organization on every call.
 */

const DECISIONS: readonly SegmentOption<UatDecision>[] = [
  { value: UAT_DECISION.APPROVED, label: 'It works' },
  { value: UAT_DECISION.CHANGES_REQUESTED, label: 'Not yet' },
];

export function SignOffDecisionForm({
  requestId,
  onDecided,
}: {
  requestId: string;
  onDecided: () => void;
}) {
  const mayDecide = usePermission(PERMISSIONS.UAT_DECIDE);
  const [decision, setDecision] = useState<UatDecision>(UAT_DECISION.APPROVED);
  const [note, setNote] = useState('');

  const decide = useApiMutation<void, UatRequestDetail>({
    path: `/portal/uat/${requestId}/decide`,
    body: () => ({ decision, ...(note.trim() ? { note: note.trim() } : {}) }),
    invalidate: [
      ['portal', 'uat', requestId],
      ['portal', 'uat'],
      ['portal', 'home'],
    ],
    onSuccess: () => {
      setNote('');
      onDecided();
    },
  });

  if (!mayDecide) {
    return (
      <Card>
        <AppText size="sm" tone="muted" weight="medium">
          Your answer
        </AppText>
        <AppText tone="muted">
          Somebody with sign-off rights at your organization has to answer this one. You can still
          ask a question below.
        </AppText>
      </Card>
    );
  }

  const changesWanted = decision === UAT_DECISION.CHANGES_REQUESTED;
  // The API accepts a bare "changes requested". Asking for the sentence anyway is the difference
  // between a team that knows what to fix and a team that has to ring somebody to find out.
  const valid = !changesWanted || note.trim().length >= 3;

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Your answer
      </AppText>

      <Segmented
        options={DECISIONS}
        value={decision}
        onChange={setDecision}
        label="Whether this works for you"
      />

      <Field
        label={changesWanted ? 'What is wrong with it?' : 'Anything to add?'}
        hint={
          changesWanted
            ? 'Required. This is what your team works from.'
            : 'Optional. Your team sees this with your approval.'
        }
      >
        <Input
          accessibilityLabel={changesWanted ? 'What is wrong with it' : 'Anything to add'}
          multiline
          numberOfLines={3}
          onChangeText={setNote}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          value={note}
        />
      </Field>

      {decide.error ? (
        <AppText tone="danger" size="sm">
          {decide.error}
        </AppText>
      ) : null}

      <Button
        label={changesWanted ? 'Ask for changes' : 'Sign it off'}
        loading={decide.busy}
        disabled={!valid}
        accessibilityHint="Sends your answer to your team"
        onPress={() => void decide.run()}
      />
      {!valid ? (
        <AppText size="xs" tone="faint">
          Say what is wrong before sending this.
        </AppText>
      ) : null}
    </Card>
  );
}

/** A question, before answering. Available to anybody at the client who can read the request. */
export function SignOffQuestionForm({
  requestId,
  onAsked,
}: {
  requestId: string;
  onAsked: () => void;
}) {
  const [body, setBody] = useState('');

  const ask = useApiMutation<void, unknown>({
    path: `/portal/uat/${requestId}/comments`,
    body: () => ({ body: body.trim() }),
    invalidate: [['portal', 'uat', requestId]],
    onSuccess: () => {
      setBody('');
      onAsked();
    },
  });

  return (
    <Card>
      <Field label="Ask your team something" hint="They answer here, not by email.">
        <Input
          accessibilityLabel="Your question"
          multiline
          numberOfLines={2}
          onChangeText={setBody}
          style={{ minHeight: 64, textAlignVertical: 'top' }}
          value={body}
        />
      </Field>
      {ask.error ? (
        <AppText tone="danger" size="sm">
          {ask.error}
        </AppText>
      ) : null}
      <Button
        label="Send the question"
        variant="secondary"
        loading={ask.busy}
        disabled={body.trim().length < 2}
        onPress={() => void ask.run()}
      />
    </Card>
  );
}
