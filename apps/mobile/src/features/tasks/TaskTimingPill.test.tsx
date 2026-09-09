import { TASK_TIMING, type TaskTimingResult } from '@ashniva/types';
import { render, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { TaskTimingPill } from './TaskTimingPill';
import { timingPill } from './task-display';

/**
 * The on-time verdict on a phone.
 *
 * The device decides nothing about lateness: `computeTaskTiming` answers on the server and the
 * value arrives on the task, so this app and the web app cannot disagree. What is asserted here is
 * the presentation — the shared label, the tone, and that a task nobody gave a deadline to gets no
 * pill rather than a neutral one.
 *
 * The pill's accessibility label is what a screen reader announces, and `Pill` prefixes it with
 * "Status:", which is why the queries below look for that form.
 *
 * `render` is awaited, as everywhere else in this app's tests: it hands back a thenable, and the
 * queries are only on the resolved value.
 */
const timing = (over: Partial<TaskTimingResult> = {}): TaskTimingResult => ({
  status: TASK_TIMING.IN_HAND,
  delayMinutes: null,
  minutesUntilDue: 300,
  estimateMinutes: 120,
  loggedMinutes: 30,
  overrunMinutes: -90,
  ...over,
});

function renderPill(value: TaskTimingResult): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <TaskTimingPill timing={value} />
    </ThemeProvider>,
  );
}

describe('timingPill', () => {
  it('gives no pill at all without an expected completion time', () => {
    // A neutral chip on an unscheduled task reads as a verdict, and there is not one to give.
    expect(
      timingPill(timing({ status: TASK_TIMING.UNSCHEDULED, minutesUntilDue: null })),
    ).toBeNull();
  });

  it.each([
    [TASK_TIMING.ON_TIME, 'On time', 'success'],
    [TASK_TIMING.IN_HAND, 'In hand', 'neutral'],
    [TASK_TIMING.AT_RISK, 'Due soon', 'warning'],
    [TASK_TIMING.DELAYED, 'Delayed', 'danger'],
  ])('maps %s to "%s" in the %s tone', (status, label, tone) => {
    // The same words the web badge uses, from the shared TASK_TIMING_LABELS rather than a native
    // rewording, so the two apps say the same thing about the same task.
    expect(timingPill(timing({ status }))).toEqual({ label, tone });
  });

  it('carries no duration, and so no second opinion about how late a task is', () => {
    const pill = timingPill(timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135 }));
    expect(pill?.label).toBe('Delayed');
    expect(pill?.label).not.toMatch(/\d/);
  });
});

describe('TaskTimingPill', () => {
  it('renders the verdict for a late task', async () => {
    const view = await renderPill(timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135 }));
    expect(view.getByLabelText('Status: Delayed')).toBeTruthy();
  });

  it('renders nothing for a task with no expected completion time', async () => {
    const view = await renderPill(
      timing({ status: TASK_TIMING.UNSCHEDULED, minutesUntilDue: null }),
    );
    expect(view.queryByLabelText('Status: No due time')).toBeNull();
    expect(view.toJSON()).toBeNull();
  });
});
