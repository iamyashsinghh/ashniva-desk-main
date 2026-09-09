import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type SessionResponse } from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { UsersRepository } from '../users/users.repository';
import { PasswordHashingService } from './password-hashing.service';
import { RefreshTokenService, type ClientMetadata } from './refresh-token.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

export interface IssuedSession {
  body: SessionResponse;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginInput {
  email: string;
  password: string;
  organizationId?: string;
}

/**
 * Login, refresh, logout and organization switching. Every path ends in `issueSession`, which
 * mints one access token (returned in the body) and one refresh token (set as a cookie by the
 * controller). Failed logins are audited but always answered with the same 401.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersRepository)) private readonly users: UsersRepository,
    private readonly passwords: PasswordHashingService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly sessions: SessionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(input: LoginInput, metadata: ClientMetadata): Promise<IssuedSession> {
    const user = await this.users.findActiveByEmail(input.email);
    const valid =
      user?.passwordHash !== null &&
      user?.passwordHash !== undefined &&
      (await this.passwords.verify(user.passwordHash, input.password));

    if (!user || !valid) {
      await this.auditLog.record({
        action: AUDIT_ACTION.AUTH_LOGIN_FAILED,
        entityType: AUDIT_ENTITY_TYPE.AUTH,
        actorUserId: user?.id,
        after: { email: input.email, reason: 'invalid_credentials' },
        ...metadata,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const organizationId = await this.sessions.resolveOrganizationId(user.id, input.organizationId);
    const session = await this.issueSession(user.id, organizationId, metadata);
    await this.users.recordLogin(user.id);
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_LOGIN,
      entityType: AUDIT_ENTITY_TYPE.AUTH,
      organizationId,
      actorUserId: user.id,
      entityId: user.id,
      ...metadata,
    });
    return session;
  }

  /** Rotates the refresh token and mints a new access token for the same organization. */
  async refresh(presentedToken: string, metadata: ClientMetadata): Promise<IssuedSession> {
    const rotated = await this.refreshTokens.rotate(presentedToken, metadata);
    const organizationId = await this.sessions.resolveOrganizationId(
      rotated.userId,
      rotated.organizationId ?? undefined,
    );
    const body = await this.buildBody(rotated.userId, organizationId);
    return { body, refreshToken: rotated.token, refreshTokenExpiresAt: rotated.expiresAt };
  }

  async logout(presentedToken: string | undefined, userId?: string): Promise<void> {
    if (presentedToken) {
      await this.refreshTokens.revoke(presentedToken);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_LOGOUT,
      entityType: AUDIT_ENTITY_TYPE.AUTH,
      actorUserId: userId,
      entityId: userId,
    });
  }

  /** Opens a new session in another organization the user belongs to; the old one is revoked. */
  async switchOrganization(
    userId: string,
    organizationId: string,
    presentedToken: string | undefined,
    metadata: ClientMetadata,
  ): Promise<IssuedSession> {
    const resolved = await this.sessions.resolveOrganizationId(userId, organizationId);
    if (presentedToken) {
      await this.refreshTokens.revoke(presentedToken);
    }
    return this.issueSession(userId, resolved, metadata);
  }

  /** Mints a session for a person who just proved who they are (login, accepted invitation). */
  async issueSession(
    userId: string,
    organizationId: string,
    metadata: ClientMetadata,
  ): Promise<IssuedSession> {
    const body = await this.buildBody(userId, organizationId);
    const refresh = await this.refreshTokens.issue(userId, organizationId, metadata);
    return { body, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt };
  }

  private async buildBody(userId: string, organizationId: string): Promise<SessionResponse> {
    const user = await this.sessions.buildSessionUser(userId, organizationId);
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      organizationId,
      roleKey: user.roleKey,
    });
    return {
      accessToken,
      accessTokenExpiresInSeconds: this.tokens.accessTokenTtlSeconds,
      user,
    };
  }
}
