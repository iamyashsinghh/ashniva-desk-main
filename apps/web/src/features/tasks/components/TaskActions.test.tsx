import { ROLE_KEYS, TASK_ACTION } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor, taskDetailFixture } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TaskActions } from './TaskActions';

function renderActions(task = taskDetailFixture()) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.DEVELOPER));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TaskActions task={task} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskActions', () => {
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

  it('enables exactly the actions the API reports as enabled', () => {
    renderActions(
      taskDetailFixture({
        actions: [
          { action: TASK_ACTION.SUBMIT, enabled: true },
          { action: TASK_ACTION.LOG_WORK, enabled: true },
          { action: TASK_ACTION.ASSIGN, enabled: false, reason: 'Only seniors reassign work' },
        ],
      }),
    );
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Log time' })).toBeEnabled();
    const assign = screen.getByRole('button', { name: 'Assign / reassign' });
    expect(assign).toBeDisabled();
    expect(assign).toHaveAccessibleDescription('Only seniors reassign work');
  });

  it('hides actions the current status rules out and explains role-based ones', () => {
    renderActions(
      taskDetailFixture({
        actions: [
          { action: TASK_ACTION.START, enabled: false, reason: 'Not available while In progress' },
          { action: TASK_ACTION.APPROVE, enabled: false, reason: 'Only the reviewer approves' },
        ],
      }),
    );
    expect(screen.queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription(
      'Only the reviewer approves',
    );
  });

  /**
   * The edit action, and what it is for.
   *
   * `PATCH /tasks/:id` and this action shipped with nothing calling them, so a task's title,
   * description, acceptance criteria, dates, estimate, reviewer and tester were whatever they were
   * at creation, for ever. A task created without a tester is the one that bites: "Send to testing"
   * reads the tester off the task, so its QA always landed in the unassigned queue.
   */
  it('offers Edit task when the API allows it, and names the tester it can now set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    renderActions(taskDetailFixture({ actions: [{ action: TASK_ACTION.EDIT, enabled: true }] }));
    const edit = screen.getByRole('button', { name: 'Edit task' });
    expect(edit).toBeEnabled();

    fireEvent.click(edit);
    await waitFor(() =>
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Printer settings screen'),
    );
    expect(screen.getByLabelText(/^Tester/)).toBeInTheDocument();
  });

  it('explains an edit the API refuses rather than hiding it', () => {
    renderActions(
      taskDetailFixture({
        actions: [
          {
            action: TASK_ACTION.EDIT,
            enabled: false,
            reason: 'Only a manager can edit this task — its creator only while it is a draft',
          },
        ],
      }),
    );
    const edit = screen.getByRole('button', { name: 'Edit task' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(/Only a manager can edit this task/);
  });

  it('never invents an action the API did not list', () => {
    renderActions(taskDetailFixture({ actions: [] }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Nothing to do on this task right now.')).toBeInTheDocument();
  });
});
