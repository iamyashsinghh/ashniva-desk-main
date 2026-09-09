import type { TestingAssignmentDetail } from '@ashniva/types';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { QaResultForm } from './QaResultForm';
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
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Card>
            <AppText size="xs" tone="faint">
              {assignment.projectName} · {assignment.kind} · {assignment.environment.toLowerCase()}
            </AppText>
            <AppText size="lg" weight="bold">
              {assignment.subjectLabel}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Pill
                label={assignmentStatusLabel(assignment.status)}
                tone={assignmentStatusTone(assignment.status)}
              />
              {assignment.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            </View>
            <AppText size="xs" tone="muted">
              Assigned by {assignment.assignedByName}
              {assignment.dueAt ? ` · due ${formatDateTime(assignment.dueAt)}` : ''}
            </AppText>
          </Card>

          {assignment.whatToTest ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                What to test
              </AppText>
              <AppText>{assignment.whatToTest}</AppText>
            </Card>
          ) : null}

          {assignment.acceptanceCriteria ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                What counts as passing
              </AppText>
              <AppText>{assignment.acceptanceCriteria}</AppText>
            </Card>
          ) : null}

          {assignment.whatDeveloped || assignment.developerNotes ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                From the developer
              </AppText>
              {assignment.whatDeveloped ? <AppText>{assignment.whatDeveloped}</AppText> : null}
              {assignment.developerNotes ? (
                <>
                  <Divider />
                  <AppText size="sm">{assignment.developerNotes}</AppText>
                </>
              ) : null}
            </Card>
          ) : null}

          {assignment.stagingUrl || assignment.testAccount ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Where and as whom
              </AppText>
              {assignment.stagingUrl ? <AppText size="sm">{assignment.stagingUrl}</AppText> : null}
              {assignment.testAccount ? (
                <>
                  <AppText size="sm">
                    {assignment.testAccount.label} · {assignment.testAccount.username}
                  </AppText>
                  <AppText size="xs" tone="faint">
                    The password is revealed on the web app, against a grant, and the reveal is
                    audited.
                  </AppText>
                </>
              ) : null}
            </Card>
          ) : null}

          {assignment.clarificationQuestion ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Your question
              </AppText>
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
            </Card>
          ) : null}

          {assignment.results.length > 0 ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Results so far ({assignment.results.length})
              </AppText>
              {assignment.results.map((row) => (
                <View key={row.id} style={{ gap: theme.spacing.xs }}>
                  <Divider />
                  <AppText size="xs" tone="faint">
                    {formatDateTime(row.createdAt)} · {row.recordedByName}
                  </AppText>
                  <AppText
                    size="sm"
                    weight="medium"
                    tone={row.outcome === 'FAIL' ? 'danger' : 'default'}
                  >
                    {row.outcome === 'FAIL' ? 'Failed' : 'Passed'}
                    {row.severity ? ` · ${row.severity.toLowerCase()}` : ''}
                  </AppText>
                  <AppText size="sm">{row.actualResult}</AppText>
                </View>
              ))}
            </Card>
          ) : null}

          {canStart(assignment.status) ? (
            <>
              <Button
                label="Start testing"
                loading={start.busy}
                accessibilityHint="Marks the assignment as in progress"
                onPress={() => void start.run()}
              />
              {start.error ? (
                <AppText tone="danger" size="sm">
                  {start.error}
                </AppText>
              ) : null}
            </>
          ) : null}

          {canRecordResult(assignment.status) ? (
            <QaResultForm assignmentId={assignment.id} onRecorded={refresh} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
