import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { ReleaseDetailRow } from './releases.repository';

/**
 * Writes back, onto every task and ticket a release carried, that it shipped.
 *
 * Until this existed a publish wrote one row — the release — and nothing else. The work itself
 * carried no trace of having gone out: a developer opening a task they finished three weeks ago
 * had no way of telling whether it was live, and a support person answering "is my fix out yet?"
 * had to find the release by hand.
 *
 * A history note, not a status change, and deliberately so. PUBLISHED_LIVE exists as a task status
 * and is unreachable in the current machine; moving tasks into it here would rewrite the task
 * workflow as a side effect of a deployment, which is the release-pipeline package's decision to
 * make and not this one's. What is unambiguous is the fact — this version, at this moment,
 * included this work — so that is what gets recorded.
 *
 * Never throws. The release is already out; failing the request afterwards would leave an operator
 * looking at an error for a deploy that succeeded, and would send them to `markFailed` for a
 * publish that did not fail.
 */
@Injectable()
export class ReleaseShippedNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReleaseShippedNotesService.name);
  }

  async recordShipped(actor: AuthenticatedUser, release: ReleaseDetailRow): Promise<void> {
    const note = `Shipped in release ${release.version}`;
    const taskIds = release.items.flatMap((item) => (item.taskId ? [item.taskId] : []));
    const ticketIds = release.items.flatMap((item) => (item.ticketId ? [item.ticketId] : []));
    if (taskIds.length === 0 && ticketIds.length === 0) {
      return;
    }

    try {
      // Read the statuses first: a history row records the state the work was in, and a
      // `fromStatus`/`toStatus` pair invented from the release would be a lie in the trail.
      const [tasks, tickets] = await Promise.all([
        this.prisma.task.findMany({
          where: { id: { in: taskIds }, organizationId: release.organizationId, deletedAt: null },
          select: { id: true, status: true },
        }),
        this.prisma.ticket.findMany({
          where: { id: { in: ticketIds }, organizationId: release.organizationId, deletedAt: null },
          select: { id: true, status: true },
        }),
      ]);

      await this.prisma.$transaction([
        this.prisma.taskStatusHistory.createMany({
          data: tasks.map((task) => ({
            taskId: task.id,
            fromStatus: task.status,
            toStatus: task.status,
            changedById: actor.userId,
            note,
          })),
        }),
        this.prisma.ticketStatusHistory.createMany({
          data: tickets.map((ticket) => ({
            ticketId: ticket.id,
            fromStatus: ticket.status,
            toStatus: ticket.status,
            changedById: actor.userId,
            note,
          })),
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        { err: error, releaseId: release.id },
        'The release published but its items could not be annotated',
      );
    }
  }
}
