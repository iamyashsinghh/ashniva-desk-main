import { Injectable } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, User, UserStatus } from '../../generated/prisma/client';

const membershipInclude = {
  user: {
    include: { teamMemberships: { include: { team: { select: { id: true, name: true } } } } },
  },
  role: { select: { id: true, key: true, name: true, isSystem: true, templateKey: true } },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.OrganizationMembershipInclude;

export type MembershipRow = Prisma.OrganizationMembershipGetPayload<{
  include: typeof membershipInclude;
}>;

export interface ListUsersFilter {
  organizationId: string;
  search?: string;
  roleKey?: string;
  status?: UserStatus;
}

export interface CreateUserInput {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string | null;
  status: UserStatus;
}

export interface UpsertMembershipInput {
  organizationId: string;
  userId: string;
  roleId: string;
  title?: string | null;
  showDevelopmentSection?: boolean;
}

/** Users and their memberships. Every list query is scoped to one organization. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: 'ACTIVE' },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  async recordLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  listMemberships(filter: ListUsersFilter): Promise<MembershipRow[]> {
    const search = filter.search?.trim();
    return this.prisma.organizationMembership.findMany({
      where: {
        organizationId: filter.organizationId,
        deletedAt: null,
        ...(filter.roleKey
          ? { role: { OR: [{ key: filter.roleKey }, { templateKey: filter.roleKey }] } }
          : {}),
        user: {
          deletedAt: null,
          ...(filter.status ? { status: filter.status } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      include: membershipInclude,
      orderBy: [{ user: { name: 'asc' } }],
      take: MAX_UNPAGINATED_ITEMS,
    });
  }

  findMembership(organizationId: string, userId: string): Promise<MembershipRow | null> {
    return this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, deletedAt: null, user: { deletedAt: null } },
      include: membershipInclude,
    });
  }

  createUser(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  updateUser(
    id: string,
    data: Partial<Pick<User, 'name' | 'phone' | 'status' | 'passwordHash'>>,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  upsertMembership(input: UpsertMembershipInput): Promise<MembershipRow> {
    const { organizationId, userId, ...rest } = input;
    return this.prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      update: { ...rest, deletedAt: null },
      create: { organizationId, userId, ...rest },
      include: membershipInclude,
    });
  }

  updateMembership(
    organizationId: string,
    userId: string,
    data: Prisma.OrganizationMembershipUncheckedUpdateInput,
  ): Promise<MembershipRow> {
    return this.prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data,
      include: membershipInclude,
    });
  }

  /** With its permissions: assigning a role grants them, so the caller has to see what it holds. */
  findRoleByKey(key: string) {
    return this.prisma.role.findFirst({
      where: { key, isSystem: true },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
  }

  /** Replaces the user's team memberships within one organization's teams. */
  async setTeams(organizationId: string, userId: string, teamIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { userId, team: { organizationId } } });
      if (teamIds.length > 0) {
        const teams = await tx.team.findMany({
          where: { id: { in: teamIds }, organizationId, deletedAt: null },
          select: { id: true },
        });
        await tx.teamMember.createMany({
          data: teams.map((team) => ({ teamId: team.id, userId })),
        });
      }
    });
  }
}
