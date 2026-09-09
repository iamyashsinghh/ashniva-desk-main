import {
  MILESTONE_STATUS,
  PROJECT_PLAN_ITEM_KIND,
  type PortalProjectPlanItem,
  type ProjectPlanItem,
  type ProjectPlanWindow,
} from '@ashniva/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toInternalBar, toPortalBar } from './plan-bars';
import { ProjectTimeline } from './ProjectTimeline';

/**
 * The timeline draws what the API sent and says so when there is nothing to draw.
 *
 * The two claims worth testing here are the ones a screenshot would not catch: a project with no
 * milestones gets an empty state rather than an empty chart, and an item the API could not place
 * on the calendar — no dates anywhere — is still named, rather than silently dropped.
 */

const WINDOW: ProjectPlanWindow = {
  startDate: '2026-07-01',
  endDate: '2026-10-31',
  todayDate: '2026-09-08',
};

function item(over: Partial<ProjectPlanItem> & { id: string; name: string }): ProjectPlanItem {
  return {
    kind: PROJECT_PLAN_ITEM_KIND.MILESTONE,
    status: MILESTONE_STATUS.IN_PROGRESS,
    startDate: '2026-08-01',
    endDate: '2026-09-15',
    datesFromTasks: false,
    progressPercent: 40,
    progressMode: 'AUTO',
    isOverdue: false,
    clientVisible: false,
    owner: null,
    dependsOnIds: [],
    tasks: { total: 5, completed: 2, open: 3, overdue: 0 },
    deliverables: { total: 2, completed: 1 },
    ...over,
  };
}

describe('ProjectTimeline', () => {
  it('shows an empty state for a project with no milestones and no work', () => {
    render(<ProjectTimeline window={WINDOW} bars={[]} emptyTitle="Nothing on the plan yet" />);
    expect(screen.getByText('Nothing on the plan yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('draws one row per item, with its dates and its percentage', () => {
    render(
      <ProjectTimeline
        window={WINDOW}
        bars={[
          item({ id: 'm-1', name: 'Discovery', progressPercent: 100 }),
          item({ id: 'm-2', name: 'Pilot store live', progressPercent: 40 }),
        ].map(toInternalBar)}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Discovery')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('names an item it cannot place instead of dropping it', () => {
    render(
      <ProjectTimeline
        window={WINDOW}
        bars={[item({ id: 'm-3', name: 'Roll-out', startDate: null, endDate: null })].map(
          toInternalBar,
        )}
      />,
    );
    expect(screen.getByText('Roll-out')).toBeInTheDocument();
    expect(screen.getByText('No dates yet')).toBeInTheDocument();
    expect(screen.getByText(/has no dates yet/)).toHaveTextContent('Roll-out');
  });

  it('keeps drawing when the project itself has no dates at all', () => {
    render(
      <ProjectTimeline
        window={{ startDate: null, endDate: null, todayDate: '2026-09-08' }}
        bars={[item({ id: 'm-4', name: 'Undated milestone' })].map(toInternalBar)}
      />,
    );
    expect(screen.getByText('Undated milestone')).toBeInTheDocument();
    expect(screen.getByText('No dates yet')).toBeInTheDocument();
  });

  it('describes the work under each milestone', () => {
    render(
      <ProjectTimeline
        window={WINDOW}
        bars={[
          item({
            id: 'm-5',
            name: 'Pilot store live',
            tasks: { total: 5, completed: 2, open: 3, overdue: 1 },
            owner: { id: 'u-1', name: 'Sneha R', email: 'lead@example.com' },
          }),
        ].map(toInternalBar)}
      />,
    );
    const meta = screen.getByText(/2\/5 tasks/);
    expect(meta).toHaveTextContent('1/2 deliverables');
    expect(meta).toHaveTextContent('1 overdue');
    expect(meta).toHaveTextContent('Sneha R');
  });

  it('tells the client how far each shared milestone has got, and nothing more', () => {
    const portalItem: PortalProjectPlanItem = {
      id: 'm-6',
      name: 'Pilot store live',
      status: MILESTONE_STATUS.IN_PROGRESS,
      startDate: '2026-08-14',
      endDate: '2026-09-20',
      progressPercent: 50,
      tasks: { total: 4, completed: 2 },
      deliverables: { total: 2, completed: 1 },
    };
    render(<ProjectTimeline window={WINDOW} bars={[portalItem].map(toPortalBar)} />);
    expect(screen.getByText('Pilot store live')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/1\/2 deliverables/)).toHaveTextContent('2/4 work items');
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });
});

describe('plan bars', () => {
  it('colours a bar by the milestone state, not by its percentage', () => {
    expect(toInternalBar(item({ id: 'a', name: 'Late', isOverdue: true })).tone).toBe('late');
    expect(
      toInternalBar(item({ id: 'b', name: 'Done', status: MILESTONE_STATUS.COMPLETED })).tone,
    ).toBe('done');
    expect(
      toInternalBar(item({ id: 'c', name: 'Planned', status: MILESTONE_STATUS.PLANNED })).tone,
    ).toBe('planned');
  });

  it('never marks a client bar late — that is the team’s business', () => {
    const portalItem: PortalProjectPlanItem = {
      id: 'm-7',
      name: 'Roll-out',
      status: MILESTONE_STATUS.IN_PROGRESS,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      progressPercent: 10,
      tasks: { total: 0, completed: 0 },
      deliverables: { total: 0, completed: 0 },
    };
    expect(toPortalBar(portalItem).tone).toBe('active');
  });
});
