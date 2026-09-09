import { PasswordHashingService } from './password-hashing.service';

describe('PasswordHashingService', () => {
  const service = new PasswordHashingService();

  it('hashes with argon2id and verifies the original password', async () => {
    const hash = await service.hash('Correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Correct horse');
    await expect(service.verify(hash, 'Correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('right');
    await expect(service.verify(hash, 'wrong')).resolves.toBe(false);
  });

  it('treats a malformed hash as a failed verification', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
