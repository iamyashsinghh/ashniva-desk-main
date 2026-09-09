import { TASK_STATUS, TASK_TIMING, type TaskTimingResult } from '@ashniva/types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { taskSummaryFixture } from '../../../test/fixtures';
import { TaskBoard } from './TaskBoard';

/**
 * The board card carries the on-time verdict too.
 *
 * It used to be in the table and nowhere else, so the same task read as late in one view of the
 * task list and said nothing at all in the other. The card takes the compact variant: its meta row
 * already prints the due phrase, and a badge repeating that number beside it is noise.
 */
function renderBoard(timing: TaskTimingResult) {
  return render(
    <MemoryRouter>
      <TaskBoard
        tasks={[taskSummaryFixture({ status: TASK_STATUS.IN_PROGRESS, dueDate: null, timing })]}
      />
    </MemoryRouter>,
  );
}

const timingFor = (
  status: (typeof TASK_TIMING)[keyof typeof TASK_TIMING],
  delayMinutes = 135,
): TaskTimingResult => ({
  status,
  delayMinutes: status === TASK_TIMING.DELAYED ? delayMinutes : null,
  minutesUntilDue: status === TASK_TIMING.UNSCHEDULED ? null : 60,
  estimateMinutes: 120,
  loggedMinutes: 30,
  overrunMinutes: -90,
});

describe('TaskBoard cards', () => {
  it('shows the verdict on a late task', () => {
    renderBoard(timingFor(TASK_TIMING.DELAYED));
    expect(screen.getByText('Delayed')).toBeInTheDocument();
    expect(document.querySelector('.ui-badge.ui-tone--danger')).not.toBeNull();
  });

  it('shows the verdict on a task that is still in hand', () => {
    renderBoard(timingFor(TASK_TIMING.AT_RISK));
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(document.querySelector('.ui-badge.ui-tone--warning')).not.toBeNull();
  });

  it('leaves a task with no expected completion time unbadged', () => {
    // The card still renders — it is the chip that must not appear, because a grey one on a task
    // nobody scheduled reads as a verdict.
    renderBoard(timingFor(TASK_TIMING.UNSCHEDULED));
    expect(screen.getByText('Printer settings screen')).toBeInTheDocument();
    expect(screen.queryByText('Delayed')).not.toBeInTheDocument();
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
    expect(screen.queryByText('In hand')).not.toBeInTheDocument();
    expect(screen.queryByText('No due time')).not.toBeInTheDocument();
  });

  it('drops the duration on a card, keeping it to the colour and the word', () => {
    renderBoard(timingFor(TASK_TIMING.DELAYED));
    expect(screen.queryByText('2h 15m late')).not.toBeInTheDocument();
  });
});
