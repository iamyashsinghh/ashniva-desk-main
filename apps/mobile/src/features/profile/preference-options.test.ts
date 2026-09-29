import {
  HALF_HOUR_TIMES,
  isChannelEnabled,
  timeOptions,
  timezoneOptions,
} from './preference-options';

describe('isChannelEnabled', () => {
  it('treats a missing entry as on for in-app and push', () => {
    expect(isChannelEnabled([], 'TASK_ASSIGNED', 'IN_APP')).toBe(true);
    expect(isChannelEnabled([], 'TASK_ASSIGNED', 'PUSH')).toBe(true);
    expect(isChannelEnabled([], 'TASK_ASSIGNED', 'EMAIL')).toBe(false);
  });

  it('uses the stored answer when there is one', () => {
    const entries = [{ type: 'TASK_ASSIGNED', channel: 'PUSH', enabled: false }] as const;
    expect(isChannelEnabled(entries, 'TASK_ASSIGNED', 'PUSH')).toBe(false);
    expect(isChannelEnabled(entries, 'TASK_ASSIGNED', 'IN_APP')).toBe(true);
  });
});

describe('timeOptions', () => {
  it('offers every half hour of the day', () => {
    expect(HALF_HOUR_TIMES).toHaveLength(48);
    expect(HALF_HOUR_TIMES[0]).toBe('00:00');
    expect(HALF_HOUR_TIMES[47]).toBe('23:30');
  });

  it('keeps a saved time set off the half hour on the web', () => {
    const values = timeOptions('22:15').map((option) => option.value);
    expect(values).toContain('22:15');
    expect(values.indexOf('22:15')).toBe(values.indexOf('22:00') + 1);
  });
});

describe('timezoneOptions', () => {
  it('adds the saved and device zones when they are not on the list', () => {
    const options = timezoneOptions('America/Anchorage', 'Europe/Lisbon');
    const values = options.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['America/Anchorage', 'Europe/Lisbon']));
    expect(options.find((option) => option.value === 'Europe/Lisbon')?.description).toBe(
      'This device',
    );
  });

  it('does not repeat a zone already on the list', () => {
    const values = timezoneOptions('Asia/Kolkata', 'Asia/Kolkata').map((option) => option.value);
    expect(values.filter((value) => value === 'Asia/Kolkata')).toHaveLength(1);
  });
});
