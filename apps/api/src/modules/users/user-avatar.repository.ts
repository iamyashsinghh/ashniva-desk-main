import { Injectable } from '@nestjs/common';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { USER_AVATAR_SELECT, type AvatarColumns } from './user-avatar';

export interface AvatarChange {
  avatarKey: string | null;
  avatarPreset: string | null;
  avatarUpdatedAt: Date | null;
}

/** Reading and writing the three picture columns of a user, and nothing else about them. */
@Injectable()
export class UserAvatarRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /** The caller's own picture. Nobody else's: the id comes from the token, never the URL. */
  findOwn(userId: string): Promise<AvatarColumns | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_AVATAR_SELECT,
    });
  }

  /**
   * Somebody's picture, only if they belong to the caller's current organization.
   *
   * A person outside the tenant is as absent as one who does not exist, so the avatar route cannot
   * be used to learn which user ids exist elsewhere.
   */
  findInTenant(userId: string): Promise<AvatarColumns | null> {
    const organizationId = this.tenant.requireOrganizationId();
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        memberships: { some: { organizationId, deletedAt: null } },
      },
      select: USER_AVATAR_SELECT,
    });
  }

  async update(userId: string, change: AvatarChange): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: change });
  }
}
