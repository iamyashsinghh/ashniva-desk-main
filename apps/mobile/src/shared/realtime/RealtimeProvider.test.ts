import { REALTIME_INVALIDATIONS, realtimeOrigin } from './RealtimeProvider';

describe('realtimeOrigin', () => {
  it('drops the API prefix, because the gateway lives at the origin', () => {
    expect(realtimeOrigin('http://192.168.1.22:5511/api/v1')).toBe('http://192.168.1.22:5511');
    expect(realtimeOrigin('https://desk.ashniva.com/api/v1')).toBe('https://desk.ashniva.com');
  });

  it('leaves something that is not a URL alone rather than inventing one', () => {
    expect(realtimeOrigin('not a url')).toBe('not a url');
  });
});

describe('REALTIME_INVALIDATIONS', () => {
  it('refreshes the work plan when a task moves, so a running timer is not stale', () => {
    expect(REALTIME_INVALIDATIONS['task.updated']).toContainEqual(['work-plan']);
  });
});
