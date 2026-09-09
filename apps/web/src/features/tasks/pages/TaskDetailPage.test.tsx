import { ROLE_KEYS, TASK_TIMING, type TaskTimingResult } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor, taskDetailFixture } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TaskDetailPage } from './TaskDetailPage';

/**
 * The on-time verdict on the screen somebody opens to find out about one task.
 *
 * It was in the task table and nowhere else, so a person could see that a task was late in the
 * list, open it, and find no mention of it. The detail screen takes the full badge — with the
 * duration — because this is where the question "how late" is actually being asked.
 */
function renderDetail(timing: TaskTimingResult) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.DEVELOPER));
  const task = taskDetailFixture({ timing, dueDate: '2026-09-07' });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('/tasks/task-1') ? task : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tasks/task-1']}>
        <Routes>
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const timing = (over: Partial<TaskTimingResult> = {}): TaskTimingResult => ({
  status: TASK_TIMING.IN_HAND,
  delayMinutes: null,
  minutesUntilDue: 300,
  estimateMinutes: 120,
  loggedMinutes: 30,
  overrunMinutes: -90,
  ...over,
});

describe('TaskDetailPage timing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says how late a delayed task is, with its duration', async () => {
    renderDetail(timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135, minutesUntilDue: -135 }));
    expect(await screen.findByText('2h 15m late')).toBeInTheDocument();
    expect(document.querySelector('.ui-badge.ui-tone--danger')).not.toBeNull();
  });

  it('shows the on-time verdict on a finished task', async () => {
    renderDetail(timing({ status: TASK_TIMING.ON_TIME }));
    expect(await screen.findByText('On time')).toBeInTheDocument();
    expect(document.querySelector('.ui-badge.ui-tone--success')).not.toBeNull();
  });

  it('leaves a task with no expected completion time unbadged', async () => {
    renderDetail(timing({ status: TASK_TIMING.UNSCHEDULED, minutesUntilDue: null }));
    // The screen renders; the chip does not. An absent deadline is not a result.
    expect(await screen.findByText('Printer settings screen')).toBeInTheDocument();
    expect(screen.queryByText('No due time')).not.toBeInTheDocument();
    expect(screen.queryByText('Delayed')).not.toBeInTheDocument();
    expect(screen.queryByText('On time')).not.toBeInTheDocument();
  });

  it('reports effort as its own sentence, separate from lateness', async () => {
    // A task can be on time having taken three times the estimate; one number for both would hide
    // whichever mattered.
    renderDetail(timing({ status: TASK_TIMING.ON_TIME, loggedMinutes: 400, overrunMinutes: 280 }));
    expect(await screen.findByText(/4h 40m over/)).toBeInTheDocument();
    expect(screen.getByText('On time')).toBeInTheDocument();
  });
});
