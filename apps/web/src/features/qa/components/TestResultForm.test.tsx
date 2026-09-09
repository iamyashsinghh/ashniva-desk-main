import {
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TestResultForm } from './TestResultForm';

/**
 * The pass/fail form.
 *
 * `RecordTestResultDto` and the workflow service refuse a failure with no description and no
 * severity, and they are the authority. This form has to ask for the same two things *before* the
 * submit, and — the part that would actually hurt — must not ask for them on a pass, which would
 * make recording a passing test impossible.
 */

const assignment: TestingAssignmentDetail = {
  id: 'assignment-1',
  kind: TESTING_ASSIGNMENT_KIND.QA,
  status: TESTING_ASSIGNMENT_STATUS.IN_PROGRESS,
  environment: 'STAGING',
  projectId: 'project-acm',
  projectName: 'Acme Retail POS',
  subjectLabel: 'ACM-12 Printer settings screen',
  taskId: 'task-1',
  ticketId: null,
  releaseId: null,
  assignedToUserId: 'user-tester',
  assignedToName: 'Tester',
  dueAt: null,
  isOverdue: false,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date().toISOString(),
  stagingUrl: 'https://staging.acme.test',
  whatDeveloped: 'A settings screen',
  whatToTest: 'Saving and reloading the settings',
  acceptanceCriteria: null,
  developerNotes: null,
  browserDevice: ['Chrome 131'],
  checksStatus: 'PASSED',
  clarificationQuestion: null,
  clarificationAnswer: null,
  assignedByName: 'Sneha N',
  testAccount: null,
  results: [],
  createdAt: new Date().toISOString(),
};

function renderForm() {
  setAuthenticated('test-token', sessionUserFor('TESTER'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestResultForm assignment={assignment} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const submit = () => screen.getByRole('button', { name: /^Record / });

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('TestResultForm', () => {
  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  });
  afterEach(() => vi.restoreAllMocks());

  it('will not record a failure without a description and a severity', () => {
    renderForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Failed' }));
    type(/What actually happened/, 'The settings reset themselves on reload');

    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription('Still needed: what is broken, a severity');

    type(/What is broken/, 'Saving writes to the wrong project');
    expect(submit()).toHaveAccessibleDescription('Still needed: a severity');

    fireEvent.change(screen.getByLabelText(/Severity/), { target: { value: 'HIGH' } });
    expect(submit()).toBeEnabled();
  });

  it('asks for neither on a pass, and never shows the severity picker', () => {
    renderForm();
    type(/What actually happened/, 'Everything saved and reloaded correctly');

    expect(screen.queryByLabelText(/Severity/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/What is broken/)).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(submit()).toHaveTextContent('Record pass');
  });

  it('still asks for the narrative fields the API requires on either outcome', () => {
    renderForm();
    type(/What you tested/, '');

    expect(submit()).toHaveAccessibleDescription(
      'Still needed: what you tested, what actually happened',
    );
  });
});
