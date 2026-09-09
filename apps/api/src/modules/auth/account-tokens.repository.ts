import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/** Invitation and password-reset rows. Only hashes are stored; the raw token is never persisted. */
@Injectable()
export class AccountTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInvitation(input: {
    organizationId: string;
    userId: string;
    roleId: string;
    email: string;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // One open invitation per person and organization (partial unique index).
      await tx.userInvitation.updateMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return tx.userInvitation.create({ data: input });
    });
  }

  findInvitationByHash(tokenHash: string) {
    return this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, email: true, name: true, status: true } },
        organization: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
      },
    });
  }

  async markInvitationAccepted(id: string, at: Date): Promise<void> {
    await this.prisma.userInvitation.update({ where: { id }, data: { acceptedAt: at } });
  }

  async revokeOpenInvitations(organizationId: string, userId: string): Promise<number> {
    const result = await this.prisma.userInvitation.updateMany({
      where: { organizationId, userId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async createResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // A new request invalidates every earlier unused link.
      await tx.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return tx.passwordResetToken.create({ data: input });
    });
  }

  findResetTokenByHash(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true, deletedAt: true } } },
    });
  }

  /** Marks the token used; returns false when another request already used it (race). */
  async consumeResetToken(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }
}
