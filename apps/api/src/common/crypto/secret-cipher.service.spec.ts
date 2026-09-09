import { randomBytes } from 'node:crypto';

import type { AppConfigService } from '../../config/app-config.service';
import { SecretCipherService } from './secret-cipher.service';

function serviceWithKey(key: string | undefined): SecretCipherService {
  const config = { encryption: { key } } as unknown as AppConfigService;
  return new SecretCipherService(config);
}

describe('SecretCipherService', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips a secret and never stores it in clear text', () => {
    const service = serviceWithKey(key);
    const encrypted = service.encrypt('super-secret-password');

    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('super-secret-password');
    expect(service.decrypt(encrypted)).toBe('super-secret-password');
  });

  it('produces a different ciphertext each time', () => {
    const service = serviceWithKey(key);
    expect(service.encrypt('same')).not.toEqual(service.encrypt('same'));
  });

  it('rejects tampered payloads', () => {
    const service = serviceWithKey(key);
    const encrypted = service.encrypt('value');
    const tampered = encrypted.slice(0, -2) + 'AA';
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('fails clearly when the key is missing or the wrong size', () => {
    expect(() => serviceWithKey(undefined).encrypt('x')).toThrow(
      /APP_ENCRYPTION_KEY is not configured/,
    );
    expect(() => serviceWithKey('c2hvcnQ=').encrypt('x')).toThrow(/exactly 32 bytes/);
  });
});
