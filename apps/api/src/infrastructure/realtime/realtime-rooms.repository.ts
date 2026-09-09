import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/**
 * The one query the websocket layer makes: which projects a connecting socket may follow.
 *
 * The predicate is the same three-way one `GET /projects?memberUserId=` uses — manager, lead, or
 * a row in `project_members` — because "the projects that are mine" has to mean the same thing on
 * the socket as in the list the socket's events link to.
 */
@Injectable()
export class RealtimeRoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async projectIdsForUser(organizationId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.project.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ managerUserId: userId }, { leadUserId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
