import { AUDIT_ACTION, ROLE_KEYS, type SessionLogEvent } from '@ashniva/types';

import { pairSessions } from './session-logs.service';

describe('pairSessions', () => {
  const user = { id: 'u1', name: 'Dev', email: 'dev@example.com' };

  function event(
    id: string,
    kind: SessionLogEvent['kind'],
    at: string,
  ): SessionLogEvent {
    return {
      id,
      kind,
      at,
      user,
      roleKey: ROLE_KEYS.DEVELOPER,
      ipAddress: null,
    };
  }

  it('pairs login with logout and measures the break until the next login', () => {
    const sessions = pairSessions([
      event('1', 'LOGIN', '2026-09-23T09:00:00.000Z'),
      event('2', 'LOGOUT', '2026-09-23T13:00:00.000Z'),
      event('3', 'LOGIN', '2026-09-23T14:00:00.000Z'),
      event('4', 'LOGOUT', '2026-09-23T18:00:00.000Z'),
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toMatchObject({
      loginAt: '2026-09-23T09:00:00.000Z',
      logoutAt: '2026-09-23T13:00:00.000Z',
      durationSeconds: 4 * 3600,
      breakAfterSeconds: 3600,
      stillOpen: false,
    });
    expect(sessions[0]).toMatchObject({
      loginAt: '2026-09-23T14:00:00.000Z',
      logoutAt: '2026-09-23T18:00:00.000Z',
      durationSeconds: 4 * 3600,
      breakAfterSeconds: null,
      stillOpen: false,
    });
  });

  it('marks a session still open when there is no logout yet', () => {
    const sessions = pairSessions([event('1', 'LOGIN', '2026-09-23T09:00:00.000Z')]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.stillOpen).toBe(true);
    expect(sessions[0]?.logoutAt).toBeNull();
    expect(sessions[0]?.durationSeconds).toBeGreaterThanOrEqual(0);
  });
});

// Keep AUDIT_ACTION import used so the test file matches production action names.
void AUDIT_ACTION;
