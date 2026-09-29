import { SLA_TARGET_STATUS, type SlaTargetState } from '@ashniva/types';

import { describeRemaining, formatSpan, slaIcon, slaNeedsAttention } from './sla-format';

const target = (overrides: Partial<SlaTargetState>): SlaTargetState => ({
  status: SLA_TARGET_STATUS.ON_TRACK,
  dueAt: '2026-09-28T12:00:00.000Z',
  warnAt: null,
  metAt: null,
  remainingMinutes: 90,
  ...overrides,
});

describe('formatSpan', () => {
  it('writes minutes alone under an hour', () => {
    expect(formatSpan(45)).toBe('45m');
    expect(formatSpan(0)).toBe('0m');
  });

  it('pads the minutes once there are hours', () => {
    expect(formatSpan(125)).toBe('2h 05m');
  });

  it('switches to days from two days on', () => {
    expect(formatSpan(48 * 60)).toBe('2d');
    expect(formatSpan(76 * 60 + 30)).toBe('3d 4h');
  });

  it('ignores the sign, which the caller words as "over"', () => {
    expect(formatSpan(-125)).toBe('2h 05m');
  });
});

describe('describeRemaining', () => {
  const formatInstant = (value: string | null) => (value ? `at ${value}` : null);

  it('says the clock is paused', () => {
    expect(describeRemaining(target({ status: SLA_TARGET_STATUS.PAUSED }), formatInstant)).toBe(
      'Clock paused',
    );
  });

  it('says when a target was reached', () => {
    expect(describeRemaining(target({ metAt: 'noon' }), formatInstant)).toBe('Reached at noon');
  });

  it('counts down, and past the target counts over', () => {
    expect(describeRemaining(target({ remainingMinutes: 90 }), formatInstant)).toBe('1h 30m left');
    expect(describeRemaining(target({ remainingMinutes: -30 }), formatInstant)).toBe('30m over');
  });

  it('has nothing to say without a number', () => {
    expect(describeRemaining(target({ remainingMinutes: null }), formatInstant)).toBe('—');
  });
});

describe('slaNeedsAttention', () => {
  it('flags only at-risk and breached targets', () => {
    expect(slaNeedsAttention(SLA_TARGET_STATUS.AT_RISK)).toBe(true);
    expect(slaNeedsAttention(SLA_TARGET_STATUS.BREACHED)).toBe(true);
    expect(slaNeedsAttention(SLA_TARGET_STATUS.ON_TRACK)).toBe(false);
    expect(slaNeedsAttention(undefined)).toBe(false);
  });

  it('gives a breach an alert icon', () => {
    expect(slaIcon(SLA_TARGET_STATUS.BREACHED)).toBe('alert-circle');
  });
});
