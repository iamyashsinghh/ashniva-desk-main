import { realtimeChannelKey } from './realtime-channel-key';

describe('realtimeChannelKey', () => {
  it('gives two deployments different channels on one Redis', () => {
    // The failure it prevents: with the library's default prefix, a staging stack and a
    // production stack pointed at the same managed Redis subscribe to the same channels and each
    // delivers the other's events to its own sockets. Nothing errors — a badge appears for the
    // wrong people and a list refreshes for no reason, and it reads as flakiness.
    expect(realtimeChannelKey('https://desk.example.com')).not.toBe(
      realtimeChannelKey('https://staging.desk.example.com'),
    );
  });

  it('is the same for one deployment, so its own instances still hear each other', () => {
    // This is the whole point of the adapter: every instance of one deployment must share a
    // channel, or an emit reaches only the sockets on the pod that ran it.
    expect(realtimeChannelKey('https://desk.example.com')).toBe(
      realtimeChannelKey('https://desk.example.com'),
    );
  });

  it('is short and does not carry the URL into channel names', () => {
    const key = realtimeChannelKey('https://desk.example.com/');
    expect(key).toMatch(/^ashniva:[0-9a-f]{16}$/);
    expect(key).not.toContain('desk.example.com');
  });
});
