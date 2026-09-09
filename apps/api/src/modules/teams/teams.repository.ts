import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const teamInclude = {
  lead: { select: { id: true, name: true, email: true } },
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  },
} satisfies Prisma.TeamInclude;

export type TeamRow = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

export interface TeamData {
  name: string;
  description?: string | null;
  leadUserId?: string | null;
}

/** Teams of one organization. `organizationId` always comes from the caller's tenant. */
@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<TeamRow[]> {
    return this.prisma.team.findMany({
      where: { organizationId, deletedAt: null },
      include: teamInclude,
      orderBy: { name: 'asc' },
    });
  }

  findById(organizationId: string, id: string): Promise<TeamRow | null> {
    return this.prisma.team.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: teamInclude,
    });
  }

  findByName(organizationId: string, name: string) {
    return this.prisma.team.findFirst({ where: { organizationId, name, deletedAt: null } });
  }

  create(organizationId: string, data: TeamData): Promise<TeamRow> {
    return this.prisma.team.create({ data: { organizationId, ...data }, include: teamInclude });
  }

  update(id: string, data: Partial<TeamData>): Promise<TeamRow> {
    return this.prisma.team.update({ where: { id }, data, include: teamInclude });
  }

  /** Replaces the member list with users who belong to the same organization. */
  async setMembers(organizationId: string, teamId: string, userIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId } });
      if (userIds.length === 0) {
        return;
      }
      const members = await tx.organizationMembership.findMany({
        where: { organizationId, userId: { in: userIds }, deletedAt: null },
        select: { userId: true },
      });
      await tx.teamMember.createMany({
        data: members.map((member) => ({ teamId, userId: member.userId })),
      });
    });
  }
}
