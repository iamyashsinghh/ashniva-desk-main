import { PERMISSIONS, ROLE_KEYS, type WorkPlanProposal } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { SummaryProposals } from './SummaryProposals';

/**
 * Work from AI Memory waiting for the Summary.
 *
 * What matters: it is shown as waiting rather than as part of the plan, only someone who may decide
 * gets Publish and Reject, and publishing sends the developer that was picked on the phone.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [PERMISSIONS.PROJECT_READ],
});

const RIYA = { id: 'dev-1', name: 'Riya Shah', email: 'riya@example.com' };

function proposal(overrides: Partial<WorkPlanProposal> = {}): WorkPlanProposal {
  return {
    id: 'prop-1',
    projectId: 'p1',
    status: 'PENDING',
    source: 'AI_MEMORY',
    externalId: 'item-1',
    phaseId: null,
    phaseHeading: 'Signing',
    titleId: null,
    title: 'Add OTP to e-sign',
    points: [{ body: 'Send an OTP before signing', estimateMinutes: 60 }],
    assignedTo: null,
    reviewer: null,
    priority: null,
    dueDate: null,
    context: 'Discussed on the Monday call',
    createdBy: { id: 'svc', name: 'AI Memory', email: 'ai@example.com' },
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    publishedTitleId: null,
    task: null,
    createdAt: '2026-09-30T08:00:00.000Z',
    canDecide: true,
    ...overrides,
  };
}

function route(waiting: WorkPlanProposal[]) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/publish') || url.includes('/reject')) {
      return jsonResponse({ proposal: { ...waiting[0], status: 'PUBLISHED' } });
    }
    if (url.includes('/work-plan/proposals')) {
      return jsonResponse(init?.method === 'POST' ? {} : waiting);
    }
    if (url.includes('/work-plan')) {
      return jsonResponse({ phases: [], developers: [RIYA] });
    }
    return jsonResponse({});
  });
}

function callTo(fragment: string): RequestInit | undefined {
  const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes(fragment));
  return call?.[1] as RequestInit | undefined;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
});

it('shows nothing when no work is waiting', async () => {
  route([]);
  const view = await renderScreen(<SummaryProposals projectId="p1" />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(view.queryByText(/Waiting for approval/)).toBeNull();
});

it('publishes with the developer picked on the phone', async () => {
  route([proposal()]);
  const view = await renderScreen(<SummaryProposals projectId="p1" />);

  expect(await view.findByText('Waiting for approval (1)')).toBeTruthy();
  expect(view.getByText('Signing (new)')).toBeTruthy();
  await fireEvent.press(await view.findByRole('radio', { name: 'Riya Shah' }));
  await fireEvent.press(view.getByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(callTo('/proposals/prop-1/publish')).toBeTruthy());
  const init = callTo('/proposals/prop-1/publish');
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual({ assignedToId: 'dev-1' });
});

it('rejects with the note that was written', async () => {
  route([proposal()]);
  const view = await renderScreen(<SummaryProposals projectId="p1" />);

  await fireEvent.press(await view.findByRole('button', { name: 'Reject' }));
  await fireEvent.changeText(view.getByPlaceholderText('e.g. Already done'), 'Already done in v2');
  await fireEvent.press(view.getByRole('button', { name: 'Reject' }));

  await waitFor(() => expect(callTo('/proposals/prop-1/reject')).toBeTruthy());
  expect(JSON.parse(String(callTo('/proposals/prop-1/reject')?.body))).toEqual({
    note: 'Already done in v2',
  });
});

it('offers no decision to someone who may not make one', async () => {
  route([proposal({ canDecide: false })]);
  const view = await renderScreen(<SummaryProposals projectId="p1" />);

  expect(await view.findByText('Add OTP to e-sign')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Reject' })).toBeNull();
});
