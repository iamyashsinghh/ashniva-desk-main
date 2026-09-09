import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type ReauthResponse } from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { UsersRepository } from '../users/users.repository';
import { PasswordHashingService } from './password-hashing.service';

interface ReauthClaims {
  sub: string;
  organizationId: string;
  purpose: 'reauth';
}

/**
 * Step-up authentication for sensitive changes (permissions, role assignments, hour
 * adjustments): the person re-enters their password and receives a short-lived token that the
 * RecentAuthGuard demands in the X-Reauth-Token header.
 */
@Injectable()
export class ReauthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHashingService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async confirmPassword(
    userId: string,
    organizationId: string,
    password: string,
  ): Promise<ReauthResponse> {
    const user = await this.users.findById(userId);
    const valid =
      user?.passwordHash !== null &&
      user?.passwordHash !== undefined &&
      (await this.passwords.verify(user.passwordHash, password));
    if (!user || !valid) {
      throw new UnauthorizedException('Password is incorrect');
    }
    const expiresInSeconds = this.config.app.reauthTtlSeconds;
    const claims: Omit<ReauthClaims, 'sub'> = { organizationId, purpose: 'reauth' };
    const reauthToken = await this.jwt.signAsync(claims, {
      subject: userId,
      secret: this.config.jwt.accessSecret,
      expiresIn: expiresInSeconds,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_REAUTHENTICATED,
      entityType: AUDIT_ENTITY_TYPE.AUTH,
      entityId: userId,
    });
    return { reauthToken, expiresInSeconds };
  }

  /** True when the token is a valid, unexpired re-auth token for exactly this person. */
  async verify(token: string, userId: string, organizationId: string): Promise<boolean> {
    try {
      const claims = await this.jwt.verifyAsync<ReauthClaims>(token, {
        secret: this.config.jwt.accessSecret,
      });
      return (
        claims.purpose === 'reauth' &&
        claims.sub === userId &&
        claims.organizationId === organizationId
      );
    } catch {
      return false;
    }
  }
}
