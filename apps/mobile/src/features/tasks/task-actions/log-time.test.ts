import { MAX_LOG_MINUTES, workMinutes } from './log-time';

describe('workMinutes', () => {
  it('adds hours and minutes, with an empty box counting as zero', () => {
    expect(workMinutes('1', '30')).toBe(90);
    expect(workMinutes('2', '')).toBe(120);
    expect(workMinutes('', '45')).toBe(45);
  });

  it('refuses nothing at all, since an entry of zero minutes records nothing', () => {
    expect(workMinutes('', '')).toBeNull();
    expect(workMinutes('0', '0')).toBeNull();
  });

  it('refuses what is not whole, negative or an impossible minute count', () => {
    expect(workMinutes('1.5', '')).toBeNull();
    expect(workMinutes('-1', '')).toBeNull();
    expect(workMinutes('1', '60')).toBeNull();
    expect(workMinutes('abc', '')).toBeNull();
  });

  it('allows up to a day and no more, as the API does', () => {
    expect(workMinutes('24', '')).toBe(MAX_LOG_MINUTES);
    expect(workMinutes('24', '1')).toBeNull();
  });
});
