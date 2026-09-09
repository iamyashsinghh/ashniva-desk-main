import { JwtService } from '@nestjs/jwt';
import { ROLE_KEYS } from '@ashniva/types';

import type { AppConfigService } from '../../config/app-config.service';
import { TokenService } from './token.service';

function buildService(accessTtlSeconds = 900): TokenService {
  const config = {
    jwt: {
      accessSecret: 'x'.repeat(32),
      refreshSecret: 'y'.repeat(32),
      accessTtlSeconds,
      refreshTtlSeconds: 1,
    },
  } as unknown as AppConfigService;
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  it('signs and verifies access token claims', async () => {
    const service = buildService();
    const token = await service.signAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      roleKey: ROLE_KEYS.DEVELOPER,
    });

    const claims = await service.verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.organizationId).toBe('org-1');
    expect(claims.roleKey).toBe(ROLE_KEYS.DEVELOPER);
  });

  it('rejects tokens signed with another secret', async () => {
    const token = await buildService().signAccessToken({
      sub: 'u',
      organizationId: 'o',
      roleKey: ROLE_KEYS.TESTER,
    });
    const other = new TokenService(new JwtService(), {
      jwt: { accessSecret: 'z'.repeat(32), accessTtlSeconds: 900 },
    } as unknown as AppConfigService);
    await expect(other.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const service = buildService(-1);
    const token = await service.signAccessToken({
      sub: 'u',
      organizationId: 'o',
      roleKey: ROLE_KEYS.TESTER,
    });
    await expect(service.verifyAccessToken(token)).rejects.toThrow(/expired/i);
  });
});
