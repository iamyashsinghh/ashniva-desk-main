import {
  PERMISSIONS,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ClarifySheet } from './ClarifySheet';
import { assignmentStatusLabel, blockedReason, isOpen } from './qa-display';

/**
 * Start testing, ask a question, record a result — the web page's "What happens next".
 *
 * A finished assignment gets no controls, and a control that would certainly be refused is drawn
 * disabled with the reason under it rather than left to fail on the round trip.
 */
export function AssignmentActionsSection({
  assignment,
  onRecordResult,
  onChanged,
}: {
  assignment: TestingAssignmentDetail;
  onRecordResult: () => void;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const [asking, setAsking] = useState(false);
  const start = useApiMutation<void, TestingAssignmentDetail>({
    path: `/qa/assignments/${assignment.id}/start`,
    invalidate: [['qa']],
    onSuccess: onChanged,
  });

  if (assignment.kind === TESTING_ASSIGNMENT_KIND.UAT) {
    return (
      <Section title="What happens next" icon="flash-outline">
        <AppText size="sm" tone="muted">
          A client UAT is decided by the client in their portal. Nothing is recorded here.
        </AppText>
      </Section>
    );
  }

  if (!isOpen(assignment.status)) {
    return (
      <Section title="What happens next" icon="flash-outline">
        <AppText size="sm" tone="muted">
          This assignment is {assignmentStatusLabel(assignment.status).toLowerCase()}. A second
          opinion is a new assignment, so nothing here can be edited.
        </AppText>
      </Section>
    );
  }

  const blocked = blockedReason(can(PERMISSIONS.QA_RECORD_RESULT), assignment, user?.id);
  const started = assignment.status === TESTING_ASSIGNMENT_STATUS.IN_PROGRESS;
  // A live verification is signed off from its checklist, never from the ordinary pass control.
  const isLive = assignment.kind === TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION;

  return (
    <Section title="What happens next" icon="flash-outline">
      <View style={{ gap: theme.spacing.sm }}>
        {started ? null : (
          <Button
            label={
              assignment.status === TESTING_ASSIGNMENT_STATUS.CLARIFICATION
                ? 'Pick it back up'
                : 'Start testing'
            }
            icon="play"
            loading={start.busy}
            disabled={Boolean(blocked)}
            accessibilityHint={blocked ?? 'Marks the assignment as in progress'}
            onPress={() => void start.run()}
          />
        )}
        {started && !isLive ? (
          <Button
            label="Record pass / fail"
            icon="clipboard-outline"
            disabled={Boolean(blocked)}
            {...(blocked ? { accessibilityHint: blocked } : {})}
            onPress={onRecordResult}
          />
        ) : null}
        {started ? (
          <Button
            label="Ask the developer"
            icon="help-circle-outline"
            variant="secondary"
            disabled={Boolean(blocked)}
            {...(blocked ? { accessibilityHint: blocked } : {})}
            onPress={() => setAsking(true)}
          />
        ) : null}
      </View>
      {blocked ? (
        <AppText size="xs" tone="muted">
          {blocked}
        </AppText>
      ) : null}
      {started ? null : (
        <AppText size="xs" tone="faint">
          Start testing so the developer can see it is being looked at.
        </AppText>
      )}
      {start.error ? (
        <Banner tone="danger" role="alert">
          {start.error}
        </Banner>
      ) : null}
      {asking ? (
        <ClarifySheet
          assignmentId={assignment.id}
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false);
            onChanged();
          }}
        />
      ) : null}
    </Section>
  );
}
