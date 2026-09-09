import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  USER_STATUS,
  type InvitationPreview,
} from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { UsersRepository } from '../users/users.repository';
import { AccountTokensRepository } from './account-tokens.repository';
import { AUTH_MAILER, type AuthMailer } from './auth-mail.port';
import { PasswordHashingService } from './password-hashing.service';
import { RefreshTokenService, type ClientMetadata } from './refresh-token.service';

export interface IssuedInvitation {
  link: string;
  expiresAt: Date;
}

/**
 * Invitation and password-reset links. Tokens are 256-bit random values that exist in clear
 * text only inside the link; the database holds a SHA-256 hash, so a database leak cannot be
 * turned into a sign-in. Every token is single use and expires.
 */
@Injectable()
export class AccountTokensService {
  constructor(
    private readonly tokens: AccountTokensRepository,
    @Inject(forwardRef(() => UsersRepository)) private readonly users: UsersRepository,
    private readonly passwords: PasswordHashingService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly auditLog: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
  ) {}

  // ---- Invitations --------------------------------------------------------------------------

  async issueInvitation(input: {
    organizationId: string;
    userId: string;
    roleId: string;
    invitedById: string;
  }): Promise<IssuedInvitation> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const token = this.newToken();
    const expiresAt = new Date(Date.now() + this.config.app.invitationTtlHours * 3_600_000);
    await this.tokens.createInvitation({
      organizationId: input.organizationId,
      userId: user.id,
      roleId: input.roleId,
      email: user.email,
      tokenHash: this.hash(token),
      invitedById: input.invitedById,
      expiresAt,
    });
    const link = `${this.config.app.webUrl}/invite/${token}`;
    await this.mailer.sendInvitation({ email: user.email, name: user.name, link, expiresAt });
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_INVITATION_CREATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user.id,
      organizationId: input.organizationId,
      after: { email: user.email, expiresAt: expiresAt.toISOString() },
    });
    return { link, expiresAt };
  }

  async previewInvitation(token: string): Promise<InvitationPreview> {
    const invitation = await this.requireOpenInvitation(token);
    return {
      email: invitation.user.email,
      name: invitation.user.name,
      organizationName: invitation.organization.name,
      roleName: invitation.role.name,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Sets the password, activates the account and returns the user id for the sign-in step. */
  async acceptInvitation(
    input: { token: string; password: string; name?: string },
    metadata: ClientMetadata,
  ): Promise<{ userId: string; organizationId: string }> {
    const invitation = await this.requireOpenInvitation(input.token);
    const now = new Date();
    await this.users.updateUser(invitation.userId, {
      passwordHash: await this.passwords.hash(input.password),
      status: USER_STATUS.ACTIVE,
      ...(input.name ? { name: input.name } : {}),
    });
    await this.tokens.markInvitationAccepted(invitation.id, now);
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_INVITATION_ACCEPTED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: invitation.userId,
      organizationId: invitation.organizationId,
      actorUserId: invitation.userId,
      after: { email: invitation.email },
      ...metadata,
    });
    return { userId: invitation.userId, organizationId: invitation.organizationId };
  }

  async revokeInvitations(organizationId: string, userId: string): Promise<void> {
    const count = await this.tokens.revokeOpenInvitations(organizationId, userId);
    if (count > 0) {
      await this.auditLog.record({
        action: AUDIT_ACTION.AUTH_INVITATION_REVOKED,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: userId,
        organizationId,
      });
    }
  }

  // ---- Password reset -----------------------------------------------------------------------

  /**
   * Always resolves without revealing whether the address exists. The link goes out through
   * the mailer port; the caller only learns "if that account exists, an e-mail was sent".
   */
  async requestPasswordReset(email: string, metadata: ClientMetadata): Promise<void> {
    const user = await this.users.findActiveByEmail(email.trim().toLowerCase());
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_PASSWORD_RESET_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.AUTH,
      actorUserId: user?.id,
      entityId: user?.id,
      after: { email, known: Boolean(user) },
      ...metadata,
    });
    if (!user) {
      return;
    }
    const token = this.newToken();
    const expiresAt = new Date(Date.now() + this.config.app.passwordResetTtlMinutes * 60_000);
    await this.tokens.createResetToken({
      userId: user.id,
      tokenHash: this.hash(token),
      expiresAt,
      ipAddress: metadata.ipAddress,
    });
    await this.mailer.sendPasswordReset({
      email: user.email,
      link: `${this.config.app.webUrl}/reset-password/${token}`,
      expiresAt,
    });
  }

  /** Single use: the token is consumed atomically before the password changes. */
  async resetPassword(token: string, password: string, metadata: ClientMetadata): Promise<void> {
    const row = await this.tokens.findResetTokenByHash(this.hash(token));
    const now = new Date();
    if (!row || row.usedAt || row.expiresAt <= now || row.user.deletedAt) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    if (!(await this.tokens.consumeResetToken(row.id, now))) {
      throw new BadRequestException('This reset link was already used');
    }
    await this.users.updateUser(row.userId, {
      passwordHash: await this.passwords.hash(password),
      ...(row.user.status === USER_STATUS.INVITED ? { status: USER_STATUS.ACTIVE } : {}),
    });
    // Every existing session is signed out: the old password may have been compromised.
    await this.refreshTokens.revokeAllForUser(row.userId);
    await this.auditLog.record({
      action: AUDIT_ACTION.AUTH_PASSWORD_RESET,
      entityType: AUDIT_ENTITY_TYPE.AUTH,
      actorUserId: row.userId,
      entityId: row.userId,
      after: { email: row.user.email },
      ...metadata,
    });
  }

  // ---- helpers -----------------------------------------------------------------------------

  private async requireOpenInvitation(token: string) {
    const invitation = await this.tokens.findInvitationByHash(this.hash(token));
    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw new NotFoundException('This invitation is no longer valid');
    }
    if (invitation.expiresAt <= new Date()) {
      throw new NotFoundException('This invitation has expired; ask for a new one');
    }
    return invitation;
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
