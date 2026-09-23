import { UnauthorizedException } from '@nestjs/common';
import { ROLE_KEYS } from '@ashniva/types';

import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { UsersRepository } from '../users/users.repository';
import { AuthService } from './auth.service';
import type { PasswordHashingService } from './password-hashing.service';
import type { RefreshTokenService } from './refresh-token.service';
import type { SessionService } from './session.service';
import type { TokenService } from './token.service';

const user = { id: 'user-1', email: 'dev@example.com', passwordHash: 'hash', status: 'ACTIVE' };

function build(overrides: { userFound?: boolean; passwordOk?: boolean } = {}) {
  const users = {
    findActiveByEmail: jest.fn(async () => (overrides.userFound === false ? null : user)),
    recordLogin: jest.fn(async () => undefined),
  };
  const passwords = { verify: jest.fn(async () => overrides.passwordOk !== false) };
  const tokens = { signAccessToken: jest.fn(async () => 'access.jwt'), accessTokenTtlSeconds: 900 };
  const refreshTokens = {
    issue: jest.fn(async () => ({
      token: 'refresh-1',
      familyId: 'f',
      expiresAt: new Date(Date.now() + 1000),
    })),
    rotate: jest.fn(async () => ({
      token: 'refresh-2',
      familyId: 'f',
      expiresAt: new Date(Date.now() + 1000),
      userId: user.id,
      organizationId: 'org-2',
    })),
    revoke: jest.fn(async () => undefined),
    peek: jest.fn(async () => ({ userId: user.id, organizationId: 'org-1' })),
  };
  const sessions = {
    resolveOrganizationId: jest.fn(
      async (_userId: string, requested?: string) => requested ?? 'org-1',
    ),
    buildSessionUser: jest.fn(async (id: string, organizationId: string) => ({
      id,
      roleKey: ROLE_KEYS.DEVELOPER,
      organization: { id: organizationId },
    })),
  };
  const auditLog = { record: jest.fn(async () => undefined) };
  const workPlanLogoutPause = { pauseRunningTimers: jest.fn(async () => 0) };

  const service = new AuthService(
    users as unknown as UsersRepository,
    passwords as unknown as PasswordHashingService,
    tokens as unknown as TokenService,
    refreshTokens as unknown as RefreshTokenService,
    sessions as unknown as SessionService,
    auditLog as unknown as AuditLogService,
    workPlanLogoutPause as never,
  );
  return { service, users, passwords, tokens, refreshTokens, sessions, auditLog, workPlanLogoutPause };
}

describe('AuthService', () => {
  it('issues an access token and a refresh token bound to the organization on login', async () => {
    const { service, refreshTokens, auditLog, users } = build();
    const session = await service.login(
      { email: user.email, password: 'pw' },
      { ipAddress: '1.1.1.1' },
    );

    expect(session.body.accessToken).toBe('access.jwt');
    expect(session.body.accessTokenExpiresInSeconds).toBe(900);
    expect(session.refreshToken).toBe('refresh-1');
    expect(refreshTokens.issue).toHaveBeenCalledWith(user.id, 'org-1', { ipAddress: '1.1.1.1' });
    expect(users.recordLogin).toHaveBeenCalledWith(user.id);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login' }));
  });

  it('answers unknown users and wrong passwords identically and audits the failure', async () => {
    for (const overrides of [{ userFound: false }, { passwordOk: false }]) {
      const { service, auditLog, refreshTokens } = build(overrides);
      await expect(service.login({ email: user.email, password: 'pw' }, {})).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login_failed' }),
      );
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    }
  });

  it('refreshes into the organization stored with the refresh token', async () => {
    const { service, sessions, tokens } = build();
    const session = await service.refresh('refresh-1', {});
    expect(sessions.buildSessionUser).toHaveBeenCalledWith(user.id, 'org-2');
    expect(tokens.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.id, organizationId: 'org-2' }),
    );
    expect(session.refreshToken).toBe('refresh-2');
  });

  it('revokes the presented token when switching organization', async () => {
    const { service, refreshTokens } = build();
    await service.switchOrganization(user.id, 'org-3', 'refresh-1', {});
    expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-1');
    expect(refreshTokens.issue).toHaveBeenCalledWith(user.id, 'org-3', {});
  });

  it('pauses work-plan timers on logout using the bearer identity', async () => {
    const { service, workPlanLogoutPause, refreshTokens } = build();
    await service.logout('refresh-1', user.id, 'org-1');
    expect(workPlanLogoutPause.pauseRunningTimers).toHaveBeenCalledWith(user.id, 'org-1');
    expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-1');
  });

  it('pauses work-plan timers on logout from the refresh cookie when no bearer user', async () => {
    const { service, workPlanLogoutPause, refreshTokens } = build();
    await service.logout('refresh-1');
    expect(refreshTokens.peek).toHaveBeenCalledWith('refresh-1');
    expect(workPlanLogoutPause.pauseRunningTimers).toHaveBeenCalledWith(user.id, 'org-1');
  });
});
