import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';

import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import type { OrganizationMembershipsRepository } from '../../organization-memberships/organization-memberships.repository';
import type { TokenService } from '../token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function buildContext(authorization?: string, isPublic = false) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: { authorization },
  };
  const context = {
    getHandler: () => (isPublic ? 'public' : 'private'),
    getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: (_key: string, targets: unknown[]) => targets[0] === 'public',
  } as unknown as Reflector;

  const tokenService = {
    verifyAccessToken: jest.fn(),
  } as unknown as jest.Mocked<TokenService>;

  const memberships = {
    findActiveMembership: jest.fn(),
  } as unknown as jest.Mocked<OrganizationMembershipsRepository>;

  const tenantContext = new TenantContextService();
  const guard = new JwtAuthGuard(reflector, tokenService, memberships, tenantContext);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('lets public routes through without a token', async () => {
    const { context } = buildContext(undefined, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('attaches the user on a public route when a bearer token is present', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      organizationId: 'o1',
      roleKey: ROLE_KEYS.DEVELOPER,
    });
    memberships.findActiveMembership.mockResolvedValue({
      role: {
        key: ROLE_KEYS.DEVELOPER,
        templateKey: null,
        permissions: [{ permission: { key: PERMISSIONS.TASK_WORK } }],
      },
      organization: { isServiceProvider: true },
    } as never);

    const { context, request } = buildContext('Bearer ok', true);
    await tenantContext.run({}, async () => {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        userId: 'u1',
        organizationId: 'o1',
        roleKey: ROLE_KEYS.DEVELOPER,
        permissions: [PERMISSIONS.TASK_WORK],
        isServiceProvider: true,
      });
    });
  });

  it('still allows a public route when the bearer token is bad', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(new Error('bad'));
    const { context, request } = buildContext('Bearer bad', true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('rejects missing tokens', async () => {
    const { context } = buildContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects invalid tokens', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(new Error('bad'));
    const { context } = buildContext('Bearer bad');
    await expect(guard.canActivate(context)).rejects.toThrow(/Invalid or expired/);
  });

  it('rejects users without an active membership', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      organizationId: 'o1',
      roleKey: ROLE_KEYS.DEVELOPER,
    });
    memberships.findActiveMembership.mockResolvedValue(null);
    const { context } = buildContext('Bearer ok');
    await expect(guard.canActivate(context)).rejects.toThrow(/not an active member/);
  });

  it('attaches the authenticated user with permissions and fills the tenant context', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      organizationId: 'o1',
      roleKey: ROLE_KEYS.DEVELOPER,
    });
    memberships.findActiveMembership.mockResolvedValue({
      role: {
        key: ROLE_KEYS.DEVELOPER,
        templateKey: null,
        permissions: [{ permission: { key: PERMISSIONS.TASK_WORK } }],
      },
      organization: { isServiceProvider: true },
    } as never);

    const { context, request } = buildContext('Bearer ok');
    await tenantContext.run({}, async () => {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        userId: 'u1',
        organizationId: 'o1',
        roleKey: ROLE_KEYS.DEVELOPER,
        permissions: [PERMISSIONS.TASK_WORK],
        isServiceProvider: true,
      });
      expect(tenantContext.get()).toEqual({ organizationId: 'o1', userId: 'u1' });
    });
  });
});
