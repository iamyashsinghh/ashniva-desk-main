import type { TestingAssignmentDetail } from '@ashniva/types';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Expandable } from '../../shared/components/Expandable';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section, useStackKeyboardOffset } from '../../shared/components/layout';
import {
  AppText,
  Button,
  Divider,
  Pill,
  PillRow,
  Screen,
} from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { humanise } from './QaQueueCounts';
import { QaResultForm } from './QaResultForm';
import { QaStagingLink } from './QaStagingLink';
import {
  assignmentStatusLabel,
  assignmentStatusTone,
  canRecordResult,
  canStart,
} from './qa-display';

/**
 * One testing assignment: everything needed to start, and the form to end with.
 *
 * The detail carries the test login's username and never its password. Revealing a credential is
 * its own audited endpoint against a live grant, and it is not on the phone: a password on screen
 * in a public place is exactly the thing that endpoint's short reveal window exists to limit.
 */
export function QaAssignmentScreen({ assignmentId }: { assignmentId: string }) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const query = useResource<TestingAssignmentDetail>(
    ['qa', 'assignments', assignmentId],
    `/qa/assignments/${assignmentId}`,
  );
  const assignment = query.data ?? null;
  const refresh = () => void query.refetch();

  const start = useApiMutation<void, TestingAssignmentDetail>({
    path: `/qa/assignments/${assignmentId}/start`,
    invalidate: [
      ['qa', 'assignments', assignmentId],
      ['qa', 'assignments'],
    ],
    onSuccess: refresh,
  });

  if (!assignment && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen>
        <LoadingState label="Loading the assignment" />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Hero
            overline={`${assignment.projectName} · ${humanise(assignment.kind)} · ${assignment.environment.toLowerCase()}`}
            title={assignment.subjectLabel}
          >
            <PillRow>
              <Pill
                label={assignmentStatusLabel(assignment.status)}
                tone={assignmentStatusTone(assignment.status)}
              />
              {assignment.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            </PillRow>
            <AppText size="xs" tone="muted">
              Assigned by {assignment.assignedByName}
              {assignment.dueAt ? ` · due ${formatDateTime(assignment.dueAt)}` : ''}
            </AppText>
          </Hero>

          {/* Starting is why somebody opened a pending assignment, so it comes before the reading. */}
          {canStart(assignment.status) ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label="Start testing"
                loading={start.busy}
                accessibilityHint="Marks the assignment as in progress"
                onPress={() => void start.run()}
              />
              {start.error ? (
                <Banner tone="danger" role="alert">
                  {start.error}
                </Banner>
              ) : null}
            </View>
          ) : null}

          {assignment.whatToTest ? (
            <Section title="What to test">
              <AppText>{assignment.whatToTest}</AppText>
            </Section>
          ) : null}

          {assignment.acceptanceCriteria ? (
            <Section title="What counts as passing">
              <AppText>{assignment.acceptanceCriteria}</AppText>
            </Section>
          ) : null}

          {assignment.whatDeveloped || assignment.developerNotes ? (
            <Section title="From the developer">
              {assignment.whatDeveloped ? <AppText>{assignment.whatDeveloped}</AppText> : null}
              {assignment.whatDeveloped && assignment.developerNotes ? <Divider /> : null}
              {assignment.developerNotes ? (
                <AppText size="sm">{assignment.developerNotes}</AppText>
              ) : null}
            </Section>
          ) : null}

          {assignment.stagingUrl || assignment.testAccount ? (
            <Section title="Where and as whom">
              {assignment.stagingUrl ? <QaStagingLink url={assignment.stagingUrl} /> : null}
              {assignment.testAccount ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <AppText size="sm">
                    {assignment.testAccount.label} · {assignment.testAccount.username}
                  </AppText>
                  <AppText size="xs" tone="faint">
                    The password is revealed on the web app, against a grant, and the reveal is
                    audited.
                  </AppText>
                </View>
              ) : null}
            </Section>
          ) : null}

          {assignment.clarificationQuestion ? (
            <Section title="Your question">
              <AppText size="sm">{assignment.clarificationQuestion}</AppText>
              {assignment.clarificationAnswer ? (
                <>
                  <Divider />
                  <AppText size="sm">{assignment.clarificationAnswer}</AppText>
                </>
              ) : (
                <AppText size="xs" tone="faint">
                  Not answered yet.
                </AppText>
              )}
            </Section>
          ) : null}

          {assignment.results.length > 0 ? (
            <Section title={`Results so far (${assignment.results.length})`}>
              <Expandable items={assignment.results} initial={5} noun="results">
                {(row, index) => (
                  <View key={row.id} style={{ gap: theme.spacing.xs }}>
                    {index > 0 ? <Divider /> : null}
                    <AppText size="xs" tone="faint">
                      {formatDateTime(row.createdAt)} · {row.recordedByName}
                    </AppText>
                    <AppText
                      size="sm"
                      weight="medium"
                      tone={row.outcome === 'FAIL' ? 'danger' : 'success'}
                    >
                      {row.outcome === 'FAIL' ? 'Failed' : 'Passed'}
                      {row.severity ? ` · ${row.severity.toLowerCase()}` : ''}
                    </AppText>
                    <AppText size="sm">{row.actualResult}</AppText>
                  </View>
                )}
              </Expandable>
            </Section>
          ) : null}

          {canRecordResult(assignment.status) ? (
            <QaResultForm assignmentId={assignment.id} onRecorded={refresh} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
