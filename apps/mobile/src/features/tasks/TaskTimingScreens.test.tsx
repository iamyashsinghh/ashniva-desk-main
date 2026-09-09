import { TASK_STATUS, TASK_TIMING, type TaskDetail, type TaskSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { TaskDetailScreen } from './TaskDetailScreen';
import { TasksScreen } from './TasksScreen';

/**
 * The on-time verdict on the two screens a person actually looks at.
 *
 * `TaskTimingPill.test.tsx` proves the mapping; this proves the screens use it — the queue row and
 * the task itself, so opening a task never changes the answer it gave in the list. Both take the
 * value straight off the DTO: nothing on the device recomputes lateness.
 */

const fetchMock = jest.fn();

/** A client that keeps nothing after the screen goes away, so the jest worker can exit. */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function taskWith(timing: TaskSummary['timing'], over: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 'task-1',
    key: 'ACM-1',
    number: 1,
    title: 'Printer settings screen',
    status: TASK_STATUS.IN_PROGRESS,
    priority: 'MEDIUM',
    project: { id: 'p1', code: 'ACM', name: 'Acme Retail POS' },
    assignedTo: null,
    createdBy: { id: 'u1', name: 'Sneha N', email: 'lead@example.com' },
    reviewer: null,
    tester: null,
    dueDate: null,
    dueAt: null,
    scheduledStartAt: null,
    isUpcoming: false,
    isOverdue: false,
    timing,
    estimateMinutes: 120,
    loggedMinutes: 30,
    clientVisible: false,
    workAreas: [],
    comments: [],
    history: [],
    workLogs: [],
    files: [],
    actions: [],
    ...over,
  } as unknown as TaskDetail;
}

const timing = (
  status: (typeof TASK_TIMING)[keyof typeof TASK_TIMING],
  over: Partial<TaskSummary['timing']> = {},
): TaskSummary['timing'] => ({
  status,
  delayMinutes: null,
  minutesUntilDue: status === TASK_TIMING.UNSCHEDULED ? null : 60,
  estimateMinutes: 120,
  loggedMinutes: 30,
  overrunMinutes: -90,
  ...over,
});

function respondWith(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function renderList(): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <TasksScreen onOpen={jest.fn()} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function renderDetail(): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <TaskDetailScreen taskId="task-1" onComplete={jest.fn()} onOpenChat={null} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('the task queue row', () => {
  it('shows the verdict on a late task', async () => {
    respondWith({ items: [taskWith(timing(TASK_TIMING.DELAYED, { delayMinutes: 135 }))] });
    const view = await renderList();
    expect(await view.findByLabelText('Status: Delayed')).toBeTruthy();
  });

  it('leaves a task with no expected completion time unbadged', async () => {
    respondWith({ items: [taskWith(timing(TASK_TIMING.UNSCHEDULED))] });
    const view = await renderList();
    // The row still renders; the pill must not, because a neutral chip reads as a verdict.
    expect(await view.findByText('Printer settings screen')).toBeTruthy();
    expect(view.queryByLabelText('Status: No due time')).toBeNull();
    expect(view.queryByLabelText('Status: Delayed')).toBeNull();
  });
});

describe('the task detail screen', () => {
  it('shows the same verdict the row showed', async () => {
    respondWith(
      taskWith(timing(TASK_TIMING.DELAYED, { delayMinutes: 135, minutesUntilDue: -135 }), {
        dueAt: '2026-09-07T17:00:00.000Z',
      }),
    );
    const view = await renderDetail();
    expect(await view.findByLabelText('Status: Delayed')).toBeTruthy();
  });

  it('says how far past the expected time a late task is', async () => {
    respondWith(
      taskWith(timing(TASK_TIMING.DELAYED, { delayMinutes: 135, minutesUntilDue: -135 }), {
        dueAt: '2026-09-07T17:00:00.000Z',
      }),
    );
    const view = await renderDetail();
    expect(await view.findByText('2 h 15 min past the expected time')).toBeTruthy();
  });

  it('leaves a task with no expected completion time unbadged', async () => {
    respondWith(taskWith(timing(TASK_TIMING.UNSCHEDULED)));
    const view = await renderDetail();
    expect(await view.findByText('Printer settings screen')).toBeTruthy();
    expect(view.queryByLabelText('Status: No due time')).toBeNull();
    expect(view.queryByText(/past the expected time/)).toBeNull();
  });
});
