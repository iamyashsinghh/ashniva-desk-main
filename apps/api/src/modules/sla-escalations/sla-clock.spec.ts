import { SLA_TARGET_STATUS } from '@ashniva/types';

import { computeTargets, metStatus, targetStatus } from './sla-clock';

const inputs = {
  calendar: {
    timezone: 'UTC',
    businessHoursStart: '00:00',
    businessHoursEnd: '24:00',
    businessDays: [1, 2, 3, 4, 5, 6, 7],
  },
  warningPercent: 80,
  firstResponseMinutes: 60,
  resolutionMinutes: 480,
};
const start = new Date('2026-03-02T10:00:00.000Z');
const minute = 60_000;

describe('SLA clock', () => {
  it('computes due and warning instants from the targets', () => {
    const targets = computeTargets(start, inputs);
    expect(targets.firstResponseDueAt.getTime()).toBe(start.getTime() + 60 * minute);
    expect(targets.firstResponseWarnAt.getTime()).toBe(start.getTime() + 48 * minute);
    expect(targets.resolutionDueAt.getTime()).toBe(start.getTime() + 480 * minute);
    expect(targets.resolutionWarnAt.getTime()).toBe(start.getTime() + 384 * minute);
  });

  it('subtracts minutes already used before a pause', () => {
    const targets = computeTargets(start, inputs, 30, 400);
    expect(targets.firstResponseDueAt.getTime()).toBe(start.getTime() + 30 * minute);
    expect(targets.firstResponseWarnAt.getTime()).toBe(start.getTime() + 18 * minute);
    // 384 warning minutes already passed → warning is due immediately
    expect(targets.resolutionWarnAt.getTime()).toBe(start.getTime());
    expect(targets.resolutionDueAt.getTime()).toBe(start.getTime() + 80 * minute);
  });

  it('classifies a running target', () => {
    const { firstResponseDueAt: due, firstResponseWarnAt: warn } = computeTargets(start, inputs);
    expect(targetStatus(due, warn, start)).toBe(SLA_TARGET_STATUS.ON_TRACK);
    expect(targetStatus(due, warn, new Date(start.getTime() + 50 * minute))).toBe(
      SLA_TARGET_STATUS.AT_RISK,
    );
    expect(targetStatus(due, warn, new Date(start.getTime() + 60 * minute))).toBe(
      SLA_TARGET_STATUS.BREACHED,
    );
  });

  it('classifies a met target', () => {
    const due = new Date(start.getTime() + 60 * minute);
    expect(metStatus(start, due)).toBe(SLA_TARGET_STATUS.MET);
    expect(metStatus(new Date(due.getTime() + 1), due)).toBe(SLA_TARGET_STATUS.MET_LATE);
    expect(metStatus(start, null)).toBe(SLA_TARGET_STATUS.MET);
  });
});
