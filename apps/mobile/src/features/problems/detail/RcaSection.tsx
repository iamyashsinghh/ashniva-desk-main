import { PERMISSIONS, PROBLEM_STATUS, type ProblemDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Grow, Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { formatDate, formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { TextActionSheet } from '../components/TextActionSheet';
import { useProblemWrite } from '../problem-api';
import { RCA_STATUS_LABELS, RCA_STATUS_TONE } from '../problem-display';
import { RcaActions } from './RcaActions';
import { RcaFormSheet } from './RcaFormSheet';
import { RCA_QUESTIONS } from './rca-questions';

type Decision = 'APPROVED' | 'CHANGES_REQUESTED';

/**
 * The root-cause analysis: read here, written in a sheet, reviewed here.
 *
 * Writing needs `rca:submit` and reviewing needs `problem:manage` — deliberately different, as on
 * the web, because the person who wrote an analysis is not the person who accepts it. Most people
 * looking at an RCA are reading somebody else's, so the answers are shown, not an empty form.
 */
export function RcaSection({ problem }: { problem: ProblemDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const [writing, setWriting] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const rca = problem.rca;
  const open = problem.status !== PROBLEM_STATUS.CLOSED;
  const canWrite = can(PERMISSIONS.RCA_SUBMIT) && open;
  const canReview = can(PERMISSIONS.PROBLEM_MANAGE) && rca?.status === 'SUBMITTED';

  const review = useProblemWrite<{ decision: Decision; note?: string }>({
    path: `/rca/${rca?.id ?? ''}/approve`,
    method: 'PATCH',
    body: (input) => input,
    onDone: () => setSendingBack(false),
  });

  return (
    <Section
      title="Root-cause analysis"
      icon="document-text-outline"
      action={
        rca ? (
          <Pill label={RCA_STATUS_LABELS[rca.status]} tone={RCA_STATUS_TONE[rca.status]} />
        ) : undefined
      }
    >
      {rca?.reviewNote ? (
        <Banner tone="danger" title="Sent back">
          {rca.reviewNote}
        </Banner>
      ) : null}
      {rca?.submittedAt ? (
        <AppText size="xs" tone="muted">
          Submitted by {rca.submittedBy?.name ?? 'somebody'} on {formatDateTime(rca.submittedAt)}
          {rca.approvedAt
            ? ` · approved by ${rca.approvedBy?.name ?? 'somebody'} on ${formatDateTime(rca.approvedAt) ?? ''}`
            : ''}
        </AppText>
      ) : null}

      {rca ? (
        <View style={{ gap: theme.spacing.md }}>
          {RCA_QUESTIONS.map((question, index) => (
            <View key={question.key} style={{ gap: 2 }}>
              <AppText size="sm" weight="medium">
                {index + 1}. {question.label}
              </AppText>
              <AppText tone={rca[question.key] ? 'default' : 'faint'}>
                {rca[question.key] || 'Not answered'}
              </AppText>
            </View>
          ))}
          <AppText size="sm" tone="muted">
            9. Owner: {rca.owner?.name ?? 'Not named'} · 10. Target date:{' '}
            {formatDate(rca.targetDate) ?? 'Not set'}
          </AppText>
          {rca.introducedByRelease ? (
            <AppText size="sm" tone="muted">
              Blames release {rca.introducedByRelease.version}
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText size="sm" tone="muted">
          No analysis has been written yet.
        </AppText>
      )}

      <RcaActions actions={problem.actions} />

      {canWrite || canReview ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {canWrite ? (
            <Grow>
              <Button
                label={rca ? 'Edit analysis' : 'Write analysis'}
                icon="create-outline"
                variant="secondary"
                onPress={() => setWriting(true)}
              />
            </Grow>
          ) : null}
          {canReview ? (
            <>
              <Grow>
                <Button
                  label="Approve"
                  icon="checkmark"
                  loading={review.busy && !sendingBack}
                  onPress={() => void review.run({ decision: 'APPROVED' })}
                />
              </Grow>
              <Grow>
                <Button
                  label="Request changes"
                  icon="arrow-undo-outline"
                  variant="dangerGhost"
                  onPress={() => {
                    review.reset();
                    setSendingBack(true);
                  }}
                />
              </Grow>
            </>
          ) : null}
        </View>
      ) : null}
      {review.error && !sendingBack ? (
        <Banner tone="danger" role="alert">
          {review.error}
        </Banner>
      ) : null}

      {writing ? <RcaFormSheet problem={problem} onClose={() => setWriting(false)} /> : null}
      {sendingBack ? (
        <TextActionSheet
          title="Send the analysis back"
          label="What has to be different"
          submitLabel="Request changes"
          submitIcon="arrow-undo-outline"
          danger
          minLength={3}
          maxLength={2000}
          busy={review.busy}
          error={review.error}
          onClose={() => setSendingBack(false)}
          onSubmit={(note) => void review.run({ decision: 'CHANGES_REQUESTED', note })}
        />
      ) : null}
    </Section>
  );
}
