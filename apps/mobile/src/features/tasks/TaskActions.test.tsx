import {
  TASK_ACTION,
  TASK_STATUS,
  type TaskActionAvailability,
  type TaskDetail,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { TaskActions } from './TaskActions';

/**
 * The Upcoming case, rendered.
 *
 * `task-display.test.ts` proves the decision; this proves the screen honours it — that the Start
 * button on a task scheduled for tomorrow is disabled, says why, and does not send the request the
 * API would refuse anyway.
 */

const fetchMock = jest.fn();

function taskWith(actions: TaskActionAvailability[]): TaskDetail {
  return {
    id: 't1',
    key: 'ASH-12',
    title: 'Fix the SSO redirect',
    status: TASK_STATUS.ASSIGNED,
    actions,
  } as unknown as TaskDetail;
}

/**
 * A client that keeps nothing after the screen goes away.
 *
 * `gcTime: 0` is not tidiness. React Query holds a finished mutation for its garbage-collection
 * window — five minutes by default — and schedules a real timer to drop it. A jest worker with one
 * of those outstanding does not exit, and the run ends in "a worker process has failed to exit
 * gracefully" instead of finishing.
 */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function renderActions(task: TaskDetail): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <TaskActions task={task} onSubmit={jest.fn()} onChanged={jest.fn()} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('a task scheduled to start later', () => {
  const upcoming = taskWith([
    { action: TASK_ACTION.START, enabled: false, reason: 'This task is scheduled to start later' },
  ]);

  it('shows Start disabled', async () => {
    const view = await renderActions(upcoming);
    const button = await view.findByRole('button', { name: 'Start work' });
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it("shows the API's reason on the screen", async () => {
    const view = await renderActions(upcoming);
    expect(await view.findByText('This task is scheduled to start later')).toBeTruthy();
  });

  it('sends nothing when it is pressed', async () => {
    const view = await renderActions(upcoming);
    await fireEvent.press(await view.findByRole('button', { name: 'Start work' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a task that can be started', () => {
  it('starts it', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 't1' }),
      headers: { get: () => null },
    } as unknown as Response);

    const view = await renderActions(taskWith([{ action: TASK_ACTION.START, enabled: true }]));
    await fireEvent.press(await view.findByRole('button', { name: 'Start work' }));

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/tasks/t1/start');
  });
});

describe('the actions this app deliberately does not have', () => {
  it('draws nothing for review, cancel or reassignment, whatever the API offers', async () => {
    // The API offers them to a manager. They are decisions about somebody else's work, taken with
    // the full history in front of you, and a phone-sized version invites a mistake that is
    // awkward to undo.
    const view = await renderActions(
      taskWith([
        { action: TASK_ACTION.APPROVE, enabled: true },
        { action: TASK_ACTION.REJECT, enabled: true },
        { action: TASK_ACTION.CANCEL, enabled: true },
        { action: TASK_ACTION.ASSIGN, enabled: true },
        { action: TASK_ACTION.REOPEN, enabled: true },
      ]),
    );

    await view.findByText('Actions');
    expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Reassign' })).toBeNull();
  });
});
