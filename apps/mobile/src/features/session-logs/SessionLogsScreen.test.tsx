import { PERMISSIONS, ROLE_KEYS, type SessionLogResponse } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { SessionLogsScreen } from './SessionLogsScreen';

/**
 * The team login & break log.
 *
 * What matters: nothing is asked for without `report:read-team`, the range reaches the API the
 * way the web sends it, and each person's sessions arrive with their totals.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const LEAD = sessionUser({
  roleKey: ROLE_KEYS.TEAM_LEAD,
  permissions: [PERMISSIONS.REPORT_READ_TEAM],
});

const ASHA = { id: 'u1', name: 'Asha Rao', email: 'asha@example.com' };

const LOG: SessionLogResponse = {
  sessions: [
    {
      id: 's1',
      user: ASHA,
      roleKey: ROLE_KEYS.DEVELOPER,
      loginAt: '2026-09-28T04:00:00.000Z',
      logoutAt: '2026-09-28T06:30:00.000Z',
      durationSeconds: 9000,
      breakAfterSeconds: 1800,
      stillOpen: false,
    },
    {
      id: 's2',
      user: ASHA,
      roleKey: ROLE_KEYS.DEVELOPER,
      loginAt: '2026-09-28T07:00:00.000Z',
      logoutAt: null,
      durationSeconds: null,
      breakAfterSeconds: null,
      stillOpen: true,
    },
  ],
  events: [
    {
      id: 'e1',
      kind: 'LOGIN',
      at: '2026-09-28T07:00:00.000Z',
      user: ASHA,
      roleKey: ROLE_KEYS.DEVELOPER,
      ipAddress: '10.0.0.4',
    },
  ],
};

function respond(log: SessionLogResponse = LOG) {
  fetchMock.mockImplementation(async (url: string) =>
    jsonResponse(String(url).includes('/users/directory') ? [] : log),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('who may read it', () => {
  it('asks nothing without report:read-team', async () => {
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({ permissions: [PERMISSIONS.REPORT_READ_OWN] }),
    });
    respond();
    const view = await renderScreen(<SessionLogsScreen />);

    expect(await view.findByText('Not available')).toBeTruthy();
    expect(requestedPaths(fetchMock).some((path) => path.includes('/session-logs'))).toBe(false);
  });
});

describe('what it shows', () => {
  beforeEach(() => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: LEAD });
  });

  it('asks for the last seven days, with the web’s day boundaries', async () => {
    respond();
    const view = await renderScreen(<SessionLogsScreen />);

    await view.findAllByText('Asha Rao');
    const path = requestedPaths(fetchMock).find((candidate) => candidate.includes('/session-logs'));
    expect(path).toMatch(/from=\d{4}-\d{2}-\d{2}T00%3A00%3A00\.000Z/);
    expect(path).toMatch(/to=\d{4}-\d{2}-\d{2}T23%3A59%3A59\.999Z/);
  });

  it('groups sessions per person with totals and the open one marked', async () => {
    respond();
    const view = await renderScreen(<SessionLogsScreen />);

    expect(await view.findByLabelText('Asha Rao: signed in 2h 30m, on break 30m')).toBeTruthy();
    expect(view.getByText('Still signed in')).toBeTruthy();
    expect(view.getByText('2 sessions', { exact: false })).toBeTruthy();
  });

  it('switches to the timeline of logins and logouts', async () => {
    respond();
    const view = await renderScreen(<SessionLogsScreen />);

    await view.findAllByText('Asha Rao');
    await fireEvent.press(view.getByRole('tab', { name: 'Timeline' }));
    expect(await view.findByText('IP 10.0.0.4', { exact: false })).toBeTruthy();
  });

  it('drops the range when any time is chosen', async () => {
    respond();
    const view = await renderScreen(<SessionLogsScreen />);

    await view.findAllByText('Asha Rao');
    fetchMock.mockClear();
    await fireEvent.press(view.getByRole('radio', { name: 'Any time' }));
    await view.findAllByText('Asha Rao');
    const last = requestedPaths(fetchMock)
      .filter((candidate) => candidate.includes('/session-logs'))
      .pop();
    expect(last).toBeDefined();
    expect(last).not.toContain('from=');
  });

  it('says what would appear when nobody has signed in', async () => {
    respond({ sessions: [], events: [] });
    const view = await renderScreen(<SessionLogsScreen />);

    expect(await view.findByText('No sessions yet')).toBeTruthy();
  });
});
