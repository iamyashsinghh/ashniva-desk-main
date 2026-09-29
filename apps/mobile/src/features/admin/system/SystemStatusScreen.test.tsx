import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { fakeApi, health, Reply } from '../shared/admin-test-data';
import { SystemStatusScreen } from './SystemStatusScreen';

/**
 * System status. A component that is down answers 503 with the full report, and that report —
 * which component, and why — is what the screen must show, not a generic failure.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as { restoreSession: jest.Mock };

beforeEach(() => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: 'SUPER_ADMIN', permissions: ['audit-log:read'] }),
  });
});

it('shows every component up with its latency', async () => {
  globalThis.fetch = fakeApi({ 'GET /health': health() }).fetch;
  const view = await renderScreen(<SystemStatusScreen />);

  expect(await view.findByText('All systems up')).toBeTruthy();
  expect(view.getByText('1.4.0')).toBeTruthy();
  expect(view.getByLabelText('PostgreSQL: up, 4 ms')).toBeTruthy();
  expect(view.getByLabelText('Background jobs: up')).toBeTruthy();
});

it('reads the 503 report and names the component that is down', async () => {
  const degraded = health({
    status: 'down',
    components: {
      ...health().components,
      redis: { status: 'down', latencyMs: 5000, message: 'Connection refused' },
    },
  });
  globalThis.fetch = fakeApi({ 'GET /health': new Reply(degraded, 503) }).fetch;
  const view = await renderScreen(<SystemStatusScreen />);

  expect(await view.findByText('Degraded')).toBeTruthy();
  expect(view.getByText('1 component down')).toBeTruthy();
  expect(view.getByLabelText('Redis: down, 5000 ms · Connection refused')).toBeTruthy();
});

it('says when the API cannot be reached', async () => {
  globalThis.fetch = (() =>
    Promise.reject(new TypeError('Network request failed'))) as typeof fetch;
  const view = await renderScreen(<SystemStatusScreen />);

  expect(await view.findByText(/The API could not be reached/)).toBeTruthy();
});
