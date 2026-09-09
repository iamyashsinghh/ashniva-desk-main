import { defaultChannelEnabled, quietHoursDeferral } from './notification-rules';

const settings = {
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Asia/Kolkata',
};

describe('notification rules', () => {
  it('does nothing when quiet hours are off', () => {
    const now = new Date('2026-03-02T18:00:00.000Z'); // 23:30 IST
    expect(quietHoursDeferral(now, { ...settings, quietHoursEnabled: false })).toBeNull();
  });

  it('defers to the morning when inside a window that crosses midnight', () => {
    const lateEvening = new Date('2026-03-02T18:00:00.000Z'); // 23:30 IST
    expect(quietHoursDeferral(lateEvening, settings)?.toISOString()).toBe(
      '2026-03-03T01:30:00.000Z', // 07:00 IST next day
    );
    const earlyMorning = new Date('2026-03-03T00:00:00.000Z'); // 05:30 IST
    expect(quietHoursDeferral(earlyMorning, settings)?.toISOString()).toBe(
      '2026-03-03T01:30:00.000Z',
    );
  });

  it('delivers immediately outside the window', () => {
    const afternoon = new Date('2026-03-02T09:00:00.000Z'); // 14:30 IST
    expect(quietHoursDeferral(afternoon, settings)).toBeNull();
  });

  it('handles a same-day window', () => {
    const daytime = { ...settings, quietHoursStart: '13:00', quietHoursEnd: '14:00' };
    const inside = new Date('2026-03-02T08:00:00.000Z'); // 13:30 IST
    expect(quietHoursDeferral(inside, daytime)?.toISOString()).toBe('2026-03-02T08:30:00.000Z');
    const outside = new Date('2026-03-02T09:00:00.000Z');
    expect(quietHoursDeferral(outside, daytime)).toBeNull();
  });

  it('only in-app is on by default', () => {
    expect(defaultChannelEnabled('IN_APP')).toBe(true);
    expect(defaultChannelEnabled('EMAIL')).toBe(false);
    expect(defaultChannelEnabled('WHATSAPP')).toBe(false);
  });
});
