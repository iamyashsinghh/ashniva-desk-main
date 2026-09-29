import { ROLE_KEYS, type SessionLogSession } from '@ashniva/types';

import {
  formatSpan,
  groupByPerson,
  presetRange,
  sessionLogQuery,
  teamTotals,
} from './session-log-display';

function session(overrides: Partial<SessionLogSession> & { id: string }): SessionLogSession {
  return {
    user: { id: 'u1', name: 'Asha', email: 'asha@example.com' },
    roleKey: ROLE_KEYS.DEVELOPER,
    loginAt: '2026-09-28T04:00:00.000Z',
    logoutAt: '2026-09-28T06:00:00.000Z',
    durationSeconds: 7200,
    breakAfterSeconds: 900,
    stillOpen: false,
    ...overrides,
  };
}

describe('formatSpan', () => {
  it('uses the web’s wording', () => {
    expect(formatSpan(null)).toBe('—');
    expect(formatSpan(42)).toBe('42s');
    expect(formatSpan(40 * 60)).toBe('40m');
    expect(formatSpan(2 * 3600)).toBe('2h');
    expect(formatSpan(2 * 3600 + 15 * 60)).toBe('2h 15m');
  });
});

describe('presetRange', () => {
  const today = new Date(2026, 8, 28, 15, 0);

  it('counts back in whole days, across a month boundary', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-09-28', to: '2026-09-28' });
    expect(presetRange('week', today)).toEqual({ from: '2026-09-22', to: '2026-09-28' });
    expect(presetRange('month', today)).toEqual({ from: '2026-08-30', to: '2026-09-28' });
  });

  it('leaves both ends open for any time', () => {
    expect(presetRange('all', today)).toEqual({ from: null, to: null });
  });
});

describe('sessionLogQuery', () => {
  it('writes the day boundaries the way the web does', () => {
    expect(sessionLogQuery({ userId: 'u1', from: '2026-09-22', to: '2026-09-28' })).toEqual({
      userId: 'u1',
      from: '2026-09-22T00:00:00.000Z',
      to: '2026-09-28T23:59:59.999Z',
    });
  });

  it('sends nothing for an open range and anyone', () => {
    expect(sessionLogQuery({ userId: null, from: null, to: null })).toEqual({});
  });
});

describe('groupByPerson and teamTotals', () => {
  const rows = [
    session({ id: 's1' }),
    session({
      id: 's2',
      loginAt: '2026-09-28T07:00:00.000Z',
      logoutAt: null,
      durationSeconds: null,
      breakAfterSeconds: null,
      stillOpen: true,
    }),
    session({
      id: 's3',
      user: { id: 'u2', name: 'Dev', email: 'dev@example.com' },
      roleKey: ROLE_KEYS.TESTER,
      durationSeconds: 3600,
      breakAfterSeconds: null,
    }),
  ];

  it('groups per person, newest session first, and sums only what was measured', () => {
    const groups = groupByPerson(rows);
    expect(groups.map((group) => group.user.name)).toEqual(['Asha', 'Dev']);
    expect(groups[0]?.sessions.map((row) => row.id)).toEqual(['s2', 's1']);
    expect(groups[0]).toMatchObject({ signedInSeconds: 7200, breakSeconds: 900, openSessions: 1 });
    expect(groups[1]).toMatchObject({ signedInSeconds: 3600, breakSeconds: 0, openSessions: 0 });
  });

  it('totals the team', () => {
    expect(teamTotals(groupByPerson(rows))).toEqual({
      people: 2,
      sessions: 3,
      signedInSeconds: 10800,
      breakSeconds: 900,
      stillSignedIn: 1,
    });
  });
});
