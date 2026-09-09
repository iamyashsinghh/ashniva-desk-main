import { SLA_TARGET_STATUS, type SlaTargetState } from '@ashniva/types';

import { describeRemaining } from './sla-format';

const target = (overrides: Partial<SlaTargetState> = {}): SlaTargetState => ({
  status: SLA_TARGET_STATUS.ON_TRACK,
  dueAt: '2026-03-02T12:00:00.000Z',
  warnAt: '2026-03-02T10:00:00.000Z',
  metAt: null,
  remainingMinutes: 135,
  ...overrides,
});

describe('describeRemaining', () => {
  it('renders the time left in hours and minutes', () => {
    expect(describeRemaining(target())).toBe('2h 15m left');
  });

  it('renders a breach as time over the target', () => {
    expect(
      describeRemaining(target({ status: SLA_TARGET_STATUS.BREACHED, remainingMinutes: -185 })),
    ).toBe('3h 05m over');
  });

  it('says the clock is paused instead of counting down', () => {
    expect(describeRemaining(target({ status: SLA_TARGET_STATUS.PAUSED }))).toBe('Clock paused');
  });

  it('reports when the target was reached', () => {
    const met = target({
      status: SLA_TARGET_STATUS.MET,
      metAt: '2026-03-02T09:30:00.000Z',
      remainingMinutes: null,
    });
    expect(describeRemaining(met)).toMatch(/^Reached /);
  });

  it('falls back to a dash when there is nothing to count', () => {
    expect(
      describeRemaining(target({ status: SLA_TARGET_STATUS.NONE, remainingMinutes: null })),
    ).toBe('—');
  });
});
