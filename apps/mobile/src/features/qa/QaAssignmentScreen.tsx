import {
  TESTING_ASSIGNMENT_KIND,
  TEST_RESULT,
  type TestingAssignmentDetail,
  type TestResult,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Hero } from '../../shared/components/layout';
import { Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { AssignmentActionsSection } from './AssignmentActionsSection';
import { AssignmentDetailsSection } from './AssignmentDetailsSection';
import { CredentialSection } from './credentials/CredentialSection';
import { ProjectTestEnvironmentsSheet } from './environments/ProjectTestEnvironmentsSheet';
import { LiveVerificationSection } from './LiveVerificationSection';
import { assignmentStatusLabel, assignmentStatusTone, isOpen } from './qa-display';
import { ASSIGNMENT_KIND_LABELS, ENVIRONMENT_LABELS } from './qa-labels';
import { ResultHistorySection } from './ResultHistorySection';
import { TestContextSection } from './TestContextSection';
import { ProjectTestAccountsSheet } from './test-accounts/ProjectTestAccountsSheet';
import { TestResultSheet } from './TestResultSheet';

/** Only one sheet at a time: a modal presented over another is not reliably shown on iOS. */
type OpenSheet =
  { kind: 'result'; outcome: TestResult } | { kind: 'accounts' } | { kind: 'environments' };

/**
 * One testing assignment — the web page's "everything a tester needs, without asking".
 *
 * The actions come first because they are why somebody opened it; then the handover, the test
 * login and its timed reveal, the result history and the details. Forms open as sheets so the
 * reading stays put underneath them.
 */
export function QaAssignmentScreen({
  assignmentId,
  onOpenProject,
}: {
  assignmentId: string;
  /** Opens the project; without it the details card simply has no project row. */
  onOpenProject?: (projectId: string) => void;
}) {
  const theme = useTheme();
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const query = useResource<TestingAssignmentDetail>(
    ['qa', 'assignment', assignmentId],
    `/qa/assignments/${assignmentId}`,
  );
  const assignment = query.data ?? null;
  const refresh = () => void query.refetch();
  const close = () => setSheet(null);

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

  const live =
    assignment.kind === TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION && isOpen(assignment.status);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero
          overline={`${assignment.projectName} · ${ASSIGNMENT_KIND_LABELS[assignment.kind]} · ${ENVIRONMENT_LABELS[assignment.environment]}`}
          title={assignment.subjectLabel}
          icon="flask"
          iconTone="violet"
        >
          <PillRow>
            <Pill
              label={assignmentStatusLabel(assignment.status)}
              tone={assignmentStatusTone(assignment.status)}
            />
            {assignment.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </PillRow>
          <MetaLine icon="person-outline" danger={assignment.isOverdue}>
            Assigned by {assignment.assignedByName}
            {assignment.dueAt ? ` · due ${formatDateTime(assignment.dueAt)}` : ''}
          </MetaLine>
        </Hero>

        {live ? (
          <LiveVerificationSection
            assignment={assignment}
            onReportFailure={() => setSheet({ kind: 'result', outcome: TEST_RESULT.FAIL })}
            onVerified={refresh}
          />
        ) : null}
        <AssignmentActionsSection
          assignment={assignment}
          onRecordResult={() => setSheet({ kind: 'result', outcome: TEST_RESULT.PASS })}
          onChanged={refresh}
        />
        <TestContextSection assignment={assignment} />
        <CredentialSection
          assignment={assignment}
          onOpenAccounts={() => setSheet({ kind: 'accounts' })}
        />
        <ResultHistorySection results={assignment.results} />
        <AssignmentDetailsSection
          assignment={assignment}
          onOpenEnvironments={() => setSheet({ kind: 'environments' })}
          {...(onOpenProject ? { onOpenProject } : {})}
        />
      </ScrollView>

      {sheet?.kind === 'result' ? (
        <TestResultSheet
          assignment={assignment}
          initialOutcome={sheet.outcome}
          onClose={close}
          onRecorded={() => {
            close();
            refresh();
          }}
        />
      ) : null}
      <ProjectTestAccountsSheet
        visible={sheet?.kind === 'accounts'}
        projectId={assignment.projectId}
        projectName={assignment.projectName}
        onClose={close}
      />
      <ProjectTestEnvironmentsSheet
        visible={sheet?.kind === 'environments'}
        projectId={assignment.projectId}
        projectName={assignment.projectName}
        onClose={close}
      />
    </Screen>
  );
}
