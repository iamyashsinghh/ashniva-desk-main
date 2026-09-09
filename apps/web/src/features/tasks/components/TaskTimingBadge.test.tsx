import { TASK_TIMING, type TaskTimingResult } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { TaskEffort, TaskTimingBadge } from './TaskTimingBadge';

/**
 * The on-time indicator, as a badge.
 *
 * It decides nothing about lateness — `computeTaskTiming` does that on the server so the web app,
 * the mobile app and a report cannot disagree. What is asserted here is the presentation: which
 * tone class each verdict gets, that a task nobody gave a deadline to gets no badge at all, and
 * that the compact variant drops the duration without changing the colour.
 */
const timing = (over: Partial<TaskTimingResult> = {}): TaskTimingResult => ({
  status: TASK_TIMING.IN_HAND,
  delayMinutes: null,
  minutesUntilDue: 300,
  estimateMinutes: 120,
  loggedMinutes: 60,
  overrunMinutes: -60,
  ...over,
});

/** The rendered chip, whatever its text. */
const badge = () => document.querySelector('.ui-badge');

describe('TaskTimingBadge', () => {
  it('shows nothing at all when no expected completion time was set', () => {
    // A grey chip on an unscheduled task reads as a verdict, and there is not one to give.
    const { container } = render(
      <TaskTimingBadge
        timing={timing({ status: TASK_TIMING.UNSCHEDULED, minutesUntilDue: null })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing on an unscheduled task in the compact variant either', () => {
    const { container } = render(
      <TaskTimingBadge
        timing={timing({ status: TASK_TIMING.UNSCHEDULED, minutesUntilDue: null })}
        compact
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [TASK_TIMING.ON_TIME, 'ui-tone--success'],
    [TASK_TIMING.IN_HAND, 'ui-tone--neutral'],
    [TASK_TIMING.AT_RISK, 'ui-tone--warning'],
    [TASK_TIMING.DELAYED, 'ui-tone--danger'],
  ])('paints %s with the %s token class', (status, toneClass) => {
    render(<TaskTimingBadge timing={timing({ status, delayMinutes: 90, minutesUntilDue: 60 })} />);
    // The tone class, not a colour: the value behind it is a CSS custom property in the design
    // tokens, so a theme change moves it without touching this component.
    expect(badge()).toHaveClass(toneClass);
  });

  it('says how late a delayed task is', () => {
    render(<TaskTimingBadge timing={timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135 })} />);
    expect(screen.getByText('2h 15m late')).toBeInTheDocument();
  });

  it('says how long is left on a task that is close to its deadline', () => {
    render(
      <TaskTimingBadge timing={timing({ status: TASK_TIMING.AT_RISK, minutesUntilDue: 90 })} />,
    );
    expect(screen.getByText('Due in 1h 30m')).toBeInTheDocument();
  });

  describe('the compact variant', () => {
    it('drops the duration, because the row it sits in already carries the number', () => {
      render(
        <TaskTimingBadge
          timing={timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135 })}
          compact
        />,
      );
      expect(screen.getByText('Delayed')).toBeInTheDocument();
      expect(screen.queryByText('2h 15m late')).not.toBeInTheDocument();
    });

    it('keeps the same tone as the full badge, so only the words change', () => {
      render(
        <TaskTimingBadge
          timing={timing({ status: TASK_TIMING.DELAYED, delayMinutes: 135 })}
          compact
        />,
      );
      expect(badge()).toHaveClass('ui-tone--danger');
    });
  });
});

describe('TaskEffort', () => {
  it('reports planned against actual as a sentence, separately from lateness', () => {
    render(
      <TaskEffort
        timing={timing({ loggedMinutes: 400, estimateMinutes: 120, overrunMinutes: 280 })}
      />,
    );
    expect(screen.getByText(/6h 40m of 2h/)).toBeInTheDocument();
    expect(screen.getByText(/4h 40m over/)).toBeInTheDocument();
  });

  it('says the estimate was right rather than staying silent on a zero overrun', () => {
    render(
      <TaskEffort
        timing={timing({ loggedMinutes: 120, estimateMinutes: 120, overrunMinutes: 0 })}
      />,
    );
    expect(screen.getByText(/exactly as estimated/)).toBeInTheDocument();
  });

  it('reports only what was logged when nobody estimated', () => {
    const { container } = render(
      <TaskEffort
        timing={timing({ loggedMinutes: 90, estimateMinutes: null, overrunMinutes: null })}
      />,
    );
    expect(container.textContent).toBe('1h 30m logged');
  });

  it('says nothing at all when there is neither an estimate nor any logged time', () => {
    const { container } = render(
      <TaskEffort
        timing={timing({ loggedMinutes: 0, estimateMinutes: null, overrunMinutes: null })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
