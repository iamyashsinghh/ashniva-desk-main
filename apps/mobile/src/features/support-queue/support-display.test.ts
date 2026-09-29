import { ROUTING_ROLE, type EffectiveAvailability, type RoutingTrailRow } from '@ashniva/types';

import {
  availabilityInput,
  availabilityTone,
  hoursLabel,
  isOvernight,
  priorityLabel,
  recordedLabel,
  scheduleDraft,
  scheduleInput,
  scheduleProblems,
  teamOptions,
  toggleDay,
  trailAttempts,
} from './support-display';

function member(overrides: Partial<EffectiveAvailability> = {}): EffectiveAvailability {
  return {
    userId: 'u1',
    user: { id: 'u1', name: 'Asha', email: 'asha@example.com' },
    status: 'AVAILABLE',
    source: 'SCHEDULE',
    until: null,
    note: null,
    updatedAt: '2026-09-28T04:00:00.000Z',
    effectiveStatus: 'AVAILABLE',
    withinSchedule: true,
    schedule: null,
    ...overrides,
  };
}

describe('team labels', () => {
  it('says when nobody has configured hours, and names the zone when they have', () => {
    expect(hoursLabel(member())).toBe('No working hours configured');
    expect(
      hoursLabel(
        member({
          schedule: {
            userId: 'u1',
            user: { id: 'u1', name: 'Asha', email: 'asha@example.com' },
            workingDays: [1, 2, 3],
            startTime: '10:00',
            endTime: '19:00',
            timezone: 'Europe/London',
            workloadLimit: null,
            updatedAt: '2026-09-28T04:00:00.000Z',
          },
        }),
      ),
    ).toBe('10:00–19:00 Europe/London');
  });

  it('tells a rota fallback apart from something recorded', () => {
    expect(recordedLabel(member())).toBe('Nothing recorded — from the rota');
    expect(recordedLabel(member({ source: 'HR' }))).toMatch(/^HR · /);
  });

  it('uses the web’s availability colours', () => {
    expect(availabilityTone('AVAILABLE')).toBe('success');
    expect(availabilityTone('AT_LIMIT')).toBe('warning');
  });

  it('names a known priority and passes an unknown one through', () => {
    expect(priorityLabel('HIGH')).toBe('High');
    expect(priorityLabel('URGENTISH')).toBe('URGENTISH');
  });
});

describe('work schedule', () => {
  it('starts from the house default when nothing is configured', () => {
    expect(scheduleDraft(member())).toEqual({
      days: [1, 2, 3, 4, 5],
      startTime: '09:30',
      endTime: '18:30',
      timezone: 'Asia/Kolkata',
      limit: '',
    });
  });

  it('toggles a day on and off', () => {
    expect(toggleDay([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('refuses a shift that starts and ends together, a malformed time and a bad limit', () => {
    const draft = scheduleDraft(member());
    expect(scheduleProblems(draft)).toEqual({});
    expect(scheduleProblems({ ...draft, endTime: '09:30' }).end).toBe(
      'A shift cannot start and end at the same time.',
    );
    expect(scheduleProblems({ ...draft, startTime: '25:00' }).start).toBeDefined();
    expect(scheduleProblems({ ...draft, limit: '2.5' }).limit).toBeDefined();
  });

  it('reads an end before the start as an overnight shift', () => {
    expect(isOvernight({ ...scheduleDraft(member()), startTime: '22:00', endTime: '06:00' })).toBe(
      true,
    );
  });

  it('normalises the clock and the limit for the API', () => {
    expect(
      scheduleInput({
        days: [1],
        startTime: '9:05',
        endTime: '17:00',
        timezone: ' ',
        limit: '4',
      }),
    ).toEqual({
      workingDays: [1],
      startTime: '09:05',
      endTime: '17:00',
      timezone: 'Asia/Kolkata',
      workloadLimit: 4,
    });
  });
});

describe('availability', () => {
  it('means the end of the chosen day, and sends a blank note as null', () => {
    expect(availabilityInput({ status: 'ON_LEAVE', until: '2026-10-02', note: '  ' })).toEqual({
      status: 'ON_LEAVE',
      until: '2026-10-02T23:59:59.000Z',
      note: null,
    });
    expect(availabilityInput({ status: 'AVAILABLE', until: null, note: 'Back' }).until).toBeNull();
  });
});

describe('teamOptions', () => {
  it('says who is available and can leave somebody out', () => {
    const team = [member(), member({ userId: 'u2', effectiveStatus: 'ON_LEAVE' })];
    expect(teamOptions(team).map((option) => option.description)).toEqual([
      'available',
      'unavailable',
    ]);
    expect(teamOptions(team, 'u1').map((option) => option.value)).toEqual(['u2']);
  });
});

describe('trailAttempts', () => {
  const row = (id: string, attempt: number, position: number): RoutingTrailRow => ({
    id,
    attempt,
    position,
    user: null,
    role: ROUTING_ROLE.PRIMARY_DEVELOPER,
    accepted: false,
    skipReason: null,
    detail: '',
    policyVersion: attempt + 2,
    createdAt: '2026-09-28T04:00:00.000Z',
  });

  it('groups by attempt in order, each in the order it was considered', () => {
    const attempts = trailAttempts([row('b', 2, 0), row('a2', 1, 1), row('a1', 1, 0)]);
    expect(attempts.map((attempt) => [attempt.attempt, attempt.policyVersion])).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(attempts[0]?.rows.map((entry) => entry.id)).toEqual(['a1', 'a2']);
  });
});
