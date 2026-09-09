import { TASK_STATUS, type StatusCount, type WorkloadEntry } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { StatusBarsCard, WorkloadCard } from './DashboardWidgets';

/**
 * Both cards drew a bar that was `aria-hidden`, with the numbers in a sibling span.
 *
 * That left a screen-reader user with "6 open · 2 overdue" and no way to tell how that compared to
 * anyone else's row — which is the only reason a manager looks at this card. The bars are now
 * meters that carry the comparison, and the words they announce are the words on the screen.
 */

function entry(over: Partial<WorkloadEntry> = {}): WorkloadEntry {
  return {
    user: { id: 'user-a', name: 'Priya Raman', email: 'priya@example.com' },
    title: null,
    openTasks: 6,
    inProgress: 0,
    inReview: 0,
    overdue: 0,
    blocked: 0,
    minutesToday: 0,
    ...over,
  };
}

describe('WorkloadCard', () => {
  it('names each bar after the person and gives it a spoken value', () => {
    render(<WorkloadCard entries={[entry({ openTasks: 6, overdue: 2 })]} />);

    const meter = screen.getByRole('progressbar', { name: 'Open tasks for Priya Raman' });
    expect(meter).toHaveAttribute('aria-valuetext', '6 open · 2 overdue');
  });

  it('shows the same words to a sighted reader', () => {
    render(<WorkloadCard entries={[entry({ openTasks: 6, blocked: 1 })]} />);
    expect(screen.getByText('6 open · 1 blocked')).toBeInTheDocument();
  });
});

describe('StatusBarsCard', () => {
  it('says what share of the open work each status holds', () => {
    const counts: StatusCount[] = [
      { status: TASK_STATUS.IN_PROGRESS, count: 3 },
      { status: TASK_STATUS.IN_REVIEW, count: 1 },
    ];
    render(<StatusBarsCard counts={counts} title="Open work" />);

    const bar = screen.getByRole('progressbar', { name: /In progress/ });
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 4');
  });
});
