import { PERMISSIONS, ROLE_KEYS, type WorkLogSummary } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { MyTimeScreen } from './MyTimeScreen';

/**
 * The time you have logged.
 *
 * The assertion that matters most is the one about *whose* time. `GET /work-logs` will answer
 * with a team's when the caller may see it, and a phone list of who logged how much is a ranking
 * whatever it is titled — so the request is pinned to the signed-in user's id, and there is no
 * control on the screen that widens it.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const DEVELOPER = sessionUser({
  roleKey: ROLE_KEYS.DEVELOPER,
  permissions: [PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.TASK_READ],
});

function entry(minutes: number, id: string): WorkLogSummary {
  return {
    id,
    task: { id: 'task-1', key: 'ASH-12', title: 'Fix the SSO redirect' },
    project: { id: 'p1', code: 'ASH', name: 'Ashniva' },
    user: { id: DEVELOPER.id, name: DEVELOPER.name, email: DEVELOPER.email },
    workDate: '2026-09-08',
    minutes,
    summary: 'Traced the redirect loop',
    proofUrl: null,
    gitRef: null,
    createdAt: '2026-09-08T17:00:00.000Z',
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: DEVELOPER });
});

describe('whose time it shows', () => {
  it('asks only for the signed-in person’s entries', async () => {
    fetchMock.mockResolvedValue(jsonResponse([entry(90, 'w1')]));
    const view = await renderScreen(<MyTimeScreen onOpenTask={jest.fn()} />);

    await view.findByText('Traced the redirect loop');
    const path = requestedPaths(fetchMock).find((candidate) => candidate.includes('/work-logs'));
    expect(path).toContain(`userId=${DEVELOPER.id}`);
  });

  it('offers no control that would widen it to anybody else', async () => {
    fetchMock.mockResolvedValue(jsonResponse([entry(90, 'w1')]));
    const view = await renderScreen(<MyTimeScreen onOpenTask={jest.fn()} />);

    await view.findByText('Traced the redirect loop');
    // Only the two date ranges. Nothing here selects a person or a team.
    expect(view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Today',
      'Last 7 days',
    ]);
  });
});

describe('what it shows', () => {
  it('totals the day and the range', async () => {
    fetchMock.mockResolvedValue(jsonResponse([entry(90, 'w1'), entry(30, 'w2')]));
    const view = await renderScreen(<MyTimeScreen onOpenTask={jest.fn()} />);

    expect(await view.findByText('2 h logged over the last seven days')).toBeTruthy();
    expect(await view.findByText('2 h')).toBeTruthy();
  });

  it('opens the task an entry was against', async () => {
    fetchMock.mockResolvedValue(jsonResponse([entry(90, 'w1')]));
    const onOpenTask = jest.fn();
    const view = await renderScreen(<MyTimeScreen onOpenTask={onOpenTask} />);

    await fireEvent.press(await view.findByRole('button', { name: 'ASH-12 1 h 30 min' }));
    expect(onOpenTask).toHaveBeenCalledWith('task-1');
  });

  it('says what would appear here when nothing has been logged', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const view = await renderScreen(<MyTimeScreen onOpenTask={jest.fn()} />);

    expect(await view.findByText('Nothing logged')).toBeTruthy();
    expect(
      await view.findByText('Time you log against a task appears here, by the day you did it.'),
    ).toBeTruthy();
  });
});

describe('when the API refuses', () => {
  it('shows its sentence and a retry rather than an empty list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'You cannot read work logs' }, 403));
    const view = await renderScreen(<MyTimeScreen onOpenTask={jest.fn()} />);

    expect(await view.findByText('You cannot read work logs')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(view.queryByText('Nothing logged')).toBeNull();
  });
});
