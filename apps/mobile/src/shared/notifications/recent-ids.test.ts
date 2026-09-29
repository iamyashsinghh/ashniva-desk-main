import { createRecentIds } from './recent-ids';

describe('the recent-id set that keeps one alert from showing twice', () => {
  it('reports the second sighting of an id as a duplicate', () => {
    const seen = createRecentIds();
    expect(seen.add('a')).toBe(true);
    expect(seen.add('a')).toBe(false);
    expect(seen.has('a')).toBe(true);
  });

  it('forgets the oldest id once it is full, so a long-running app does not grow without bound', () => {
    const seen = createRecentIds(2);
    seen.add('a');
    seen.add('b');
    seen.add('c');
    expect(seen.has('a')).toBe(false);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });

  it('starts clean after clear, for the next person on a shared phone', () => {
    const seen = createRecentIds();
    seen.add('a');
    seen.clear();
    expect(seen.add('a')).toBe(true);
  });
});
