import { HOUR_LEDGER_KIND } from '@ashniva/types';

import {
  addMonths,
  carryForwardMinutes,
  computeBalance,
  periodContaining,
  tracksHours,
} from './contract-periods';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('contract periods', () => {
  it('adds months without overflowing short months', () => {
    expect(addMonths(d('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(d('2026-03-31'), 1).toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('anchors monthly periods on the contract start day', () => {
    const contract = {
      startDate: d('2026-01-15'),
      endDate: null,
      billingPeriod: 'MONTHLY' as const,
    };
    const period = periodContaining(contract, d('2026-03-20'));
    expect(period.start.toISOString().slice(0, 10)).toBe('2026-03-15');
    expect(period.end.toISOString().slice(0, 10)).toBe('2026-04-14');
  });

  it('caps the last period at the contract end date and handles whole-term contracts', () => {
    const quarterly = {
      startDate: d('2026-01-01'),
      endDate: d('2026-05-15'),
      billingPeriod: 'QUARTERLY' as const,
    };
    const last = periodContaining(quarterly, d('2026-05-01'));
    expect(last.start.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(last.end.toISOString().slice(0, 10)).toBe('2026-05-15');

    const whole = {
      startDate: d('2026-01-01'),
      endDate: d('2026-12-31'),
      billingPeriod: 'WHOLE_TERM' as const,
    };
    const only = periodContaining(whole, d('2026-08-08'));
    expect(only.start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(only.end.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('applies carry-forward rules', () => {
    expect(carryForwardMinutes('NONE', null, 300)).toBe(0);
    expect(carryForwardMinutes('FULL', null, 300)).toBe(300);
    expect(carryForwardMinutes('CAPPED', 120, 300)).toBe(120);
    expect(carryForwardMinutes('CAPPED', null, 300)).toBe(0);
    expect(carryForwardMinutes('FULL', null, -30)).toBe(0);
  });

  it('computes the balance from signed ledger rows', () => {
    const balance = computeBalance(
      [
        { kind: HOUR_LEDGER_KIND.INCLUDED, minutes: 600 },
        { kind: HOUR_LEDGER_KIND.PURCHASED, minutes: 120 },
        { kind: HOUR_LEDGER_KIND.CARRY_FORWARD, minutes: 30 },
        { kind: HOUR_LEDGER_KIND.CONSUMED, minutes: -200 },
        { kind: HOUR_LEDGER_KIND.CONSUMED, minutes: -50 },
        { kind: HOUR_LEDGER_KIND.RESERVED, minutes: -60 },
        { kind: HOUR_LEDGER_KIND.RELEASED, minutes: 20 },
        { kind: HOUR_LEDGER_KIND.ADJUSTMENT, minutes: -10 },
      ],
      { start: d('2026-03-01'), end: d('2026-03-31') },
      300,
    );
    expect(balance).toMatchObject({
      includedMinutes: 600,
      purchasedMinutes: 120,
      carriedForwardMinutes: 30,
      consumedMinutes: 250,
      reservedMinutes: 40,
      adjustmentMinutes: -10,
      remainingMinutes: 450,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      isLow: false,
    });
    expect(
      computeBalance(
        [{ kind: HOUR_LEDGER_KIND.INCLUDED, minutes: 100 }],
        { start: null, end: null },
        300,
      ).isLow,
    ).toBe(true);
  });

  it('knows which contracts track hours', () => {
    expect(tracksHours({ includedMinutesPerPeriod: 0, type: 'FIXED_PRICE' })).toBe(false);
    expect(tracksHours({ includedMinutesPerPeriod: 0, type: 'SUPPORT_HOURS' })).toBe(true);
    expect(tracksHours({ includedMinutesPerPeriod: 1200, type: 'AMC' })).toBe(true);
  });
});
