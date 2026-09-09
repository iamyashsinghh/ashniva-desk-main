import {
  OPERATIONS_SCOPE,
  type OperationsDashboard as OperationsDashboardData,
} from '@ashniva/types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { OperationsDashboard } from './OperationsDashboard';

/**
 * The operational dashboard renders exactly what the API sent it, and nothing where the API sent
 * nothing.
 *
 * The claim worth testing on this side is the second half: a section the caller may not see is
 * absent from the payload, and the screen must not put a heading, a placeholder or a zero in its
 * place — an empty "Team" card would tell a reader something they were not granted.
 */

function payload(over: Partial<OperationsDashboardData> = {}): OperationsDashboardData {
  return {
    kind: 'operations',
    scope: { kind: OPERATIONS_SCOPE.TEAM, projectIds: ['project-a'], taskListView: 'team' },
    projects: [
      {
        project: { id: 'project-a', code: 'ACM', name: 'Acme Retail POS' },
        clientOrganization: { id: 'org-acme', name: 'Acme Retail', slug: 'acme' },
        status: 'ACTIVE',
        health: 'AT_RISK',
        progressPercent: 42,
        manager: null,
        lead: null,
        team: [
          {
            id: 'user-dev',
            name: 'Priya S',
            email: 'priya@example.com',
            role: 'DEVELOPER',
            responsibilities: ['Frontend'],
          },
        ],
        blocked: 2,
        overdue: 1,
        pendingQa: 3,
        pendingUat: 0,
        pendingRelease: 1,
        openTickets: 4,
        escalatedTickets: 1,
      },
    ],
    today: {
      scheduled: 5,
      started: 3,
      completed: 2,
      overdue: 1,
      upcoming: 4,
      blocked: 2,
      returnedToDeveloper: 1,
      waitingForReview: 6,
      waitingForQa: 3,
    },
    time: {
      inHand: 4,
      atRisk: 2,
      delayed: 1,
      unscheduled: 7,
      completedOnTime: 3,
      completedLate: 1,
      completedUnscheduled: 0,
      estimateMinutes: 600,
      loggedMinutes: 720,
      tasks: [],
    },
    support: {
      newTickets: 2,
      assigned: 3,
      unacknowledged: 1,
      escalated: 1,
      slaAtRisk: 0,
      slaBreached: 0,
      attention: [],
    },
    release: {
      qaWaiting: 2,
      qaFailed: 1,
      qaPassed: 5,
      uatPending: 1,
      blockers: 0,
      readyToRelease: 2,
      releases: [],
    },
    ...over,
  };
}

const show = (data: OperationsDashboardData) =>
  render(
    <MemoryRouter>
      <OperationsDashboard data={data} />
    </MemoryRouter>,
  );

describe('OperationsDashboard', () => {
  it('shows the sections every manager gets', () => {
    show(payload());

    for (const heading of ['Today', 'Projects', 'Time', 'Support', 'Release & QA']) {
      expect(screen.getByRole('heading', { name: new RegExp(heading, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByText('Acme Retail POS')).toBeInTheDocument();
    // What each person is responsible for on this project, not just that they are on it.
    expect(screen.getByText(/Priya S \(Frontend\)/)).toBeInTheDocument();
  });

  // The section headings carry a hint after the name, so they are matched as a prefix.
  it.each([/^Team/, /^Cost/])('renders no %s heading when the API omitted the section', (name) => {
    show(payload());
    expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
  });

  it('renders the team section, with availability, when the API sent both', () => {
    show(
      payload({
        team: [
          {
            user: { id: 'user-dev', name: 'Priya S', email: 'priya@example.com' },
            title: 'Developer',
            openTasks: 3,
            inProgress: 1,
            dueToday: 1,
            delayed: 2,
            minutesToday: 90,
            currentTask: { id: 'task-1', key: 'ACM-12', title: 'Checkout screen' },
          },
        ],
        availability: [
          {
            user: { id: 'user-dev', name: 'Priya S', email: 'priya@example.com' },
            status: 'ON_LEAVE',
            available: false,
            reason: 'ON_LEAVE',
            withinSchedule: false,
            fromSchedule: false,
            onCall: false,
            schedule: {
              workingDays: [1, 2, 3, 4, 5],
              startMinute: 570,
              endMinute: 1110,
              timezone: 'Asia/Kolkata',
            },
          },
        ],
      }),
    );

    expect(screen.getByRole('heading', { name: /^Team/ })).toBeInTheDocument();
    expect(screen.getByText(/ACM-12/)).toBeInTheDocument();
    expect(screen.getByText('On leave')).toBeInTheDocument();
    expect(screen.getByText(/09:30–18:30 Asia\/Kolkata/)).toBeInTheDocument();
  });

  it('says nobody is on the team rather than showing an empty table', () => {
    show(payload({ team: [] }));
    expect(screen.getByText('Nobody in your team yet')).toBeInTheDocument();
  });

  it('explains an empty support queue instead of leaving the card blank', () => {
    show(payload());
    expect(screen.getByText('Nothing waiting')).toBeInTheDocument();
    expect(screen.getByText('Nothing in the pipeline')).toBeInTheDocument();
  });

  it('says so when the caller is on no project yet', () => {
    show(payload({ projects: [] }));
    expect(screen.getByText('No projects in your scope')).toBeInTheDocument();
  });

  it('opens the task list the Today cards counted', () => {
    show(payload());
    // The scope is a team lead's, so every task card points at the team view.
    expect(screen.getByRole('button', { name: /Blocked/ })).toBeInTheDocument();
  });

  // The ticket list filters one project at a time; a scope of several has no URL that means the
  // same rows, so the card must not pretend it does.
  it('leaves a support card unclickable, with the reason, when no list can reproduce its scope', () => {
    show(
      payload({
        scope: {
          kind: OPERATIONS_SCOPE.TEAM,
          projectIds: ['project-a', 'project-b'],
          taskListView: 'team',
        },
      }),
    );

    expect(screen.queryByRole('button', { name: /Escalated/ })).not.toBeInTheDocument();
    /*
     * Rewritten with the `title` attribute this screen used to carry.
     *
     * The reason now reaches a reader twice over, and the count is deliberate rather than an
     * accident: a `Tooltip` bubble per card, which is what a pointer gets and what Escape
     * dismisses, and the visually hidden sentence, which is what a screen reader gets — the tile
     * is not focusable, so an `aria-describedby` alone would never be read out. Two nodes per
     * card, five cards.
     */
    expect(screen.getAllByRole('tooltip', { hidden: true }).length).toBe(5);
    expect(screen.getAllByText(/The ticket list filters one project at a time/).length).toBe(10);
  });

  it('shows contract money only when the API sent it', () => {
    show(
      payload({
        cost: [{ currency: 'INR', contracts: 2, contractValue: '1200000', internalCost: '450000' }],
      }),
    );
    expect(screen.getByRole('heading', { name: /^Cost/ })).toBeInTheDocument();
    expect(screen.getByText(/internal 450000/)).toBeInTheDocument();
  });
});
