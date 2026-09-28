import { isAllowedPushEndpoint } from './web-push.channel';

describe('isAllowedPushEndpoint', () => {
  it('accepts known HTTPS push hosts', () => {
    expect(
      isAllowedPushEndpoint(
        'https://fcm.googleapis.com/fcm/send/abc',
      ),
    ).toBe(true);
    expect(
      isAllowedPushEndpoint(
        'https://updates.push.services.mozilla.com/wpush/v2/token',
      ),
    ).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/token')).toBe(true);
  });

  it('rejects non-https and unknown hosts', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil.example/push')).toBe(false);
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false);
  });
});
