import { Injectable } from '@nestjs/common';
import type { CallStatus } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const USER_REF = { select: { id: true, name: true, email: true } };

const CALL_INCLUDE = {
  initiatedBy: USER_REF,
  requester: USER_REF,
  connectedUser: USER_REF,
  externalRequester: { select: { id: true, name: true, email: true } },
  ticket: { select: { id: true, number: true, projectId: true, clientOrganizationId: true } },
  attempts: { include: { target: USER_REF }, orderBy: { sequence: 'asc' } },
} satisfies Prisma.CallLogInclude;

export type CallRow = Prisma.CallLogGetPayload<{ include: typeof CALL_INCLUDE }>;
export type CallAttemptRow = CallRow['attempts'][number];

/**
 * Data access for support calls.
 *
 * Every method that a request can reach takes `organizationId` first and puts it in the where
 * clause. The exception is `findByProviderCallId`, which is how an unauthenticated webhook finds
 * the call it is about — and *that* is exactly why the organization is read out of the row it
 * returns rather than out of the callback, so a spoofed payload has nothing to steer with.
 */
@Injectable()
export class CallLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(organizationId: string, id: string): Promise<CallRow | null> {
    return this.prisma.callLog.findFirst({
      where: { id, organizationId },
      include: CALL_INCLUDE,
    });
  }

  forTicket(organizationId: string, ticketId: string): Promise<CallRow[]> {
    return this.prisma.callLog.findMany({
      where: { organizationId, ticketId },
      include: CALL_INCLUDE,
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * The call a provider event belongs to.
   *
   * Deliberately not scoped to an organization: this *is* how an unauthenticated delivery is
   * attributed. The caller has already proved which tenant signed the delivery, and must check
   * that the row it gets back belongs to that same tenant — a provider call id from one tenant
   * naming another tenant's call is a spoof, not a routing hint.
   */
  findByProviderCallId(providerKey: string, providerCallId: string): Promise<CallRow | null> {
    return this.prisma.callLog.findUnique({
      where: { providerKey_providerCallId: { providerKey, providerCallId } },
      include: CALL_INCLUDE,
    });
  }

  /**
   * The call an event about a superseded leg belongs to.
   *
   * The call row carries only the latest attempt's provider id, so once the ladder has moved on,
   * an event about an earlier destination would look like an unknown call — and an unknown
   * delivery is one the provider keeps retrying. The attempt rows remember every leg.
   */
  async findByAttemptProviderCallId(providerCallId: string): Promise<CallRow | null> {
    const attempt = await this.prisma.callAttempt.findFirst({
      where: { providerCallId },
      select: { callId: true, organizationId: true },
      orderBy: { sequence: 'desc' },
    });
    if (!attempt) {
      return null;
    }
    return this.prisma.callLog.findFirst({
      where: { id: attempt.callId },
      include: CALL_INCLUDE,
    });
  }

  create(data: Prisma.CallLogUncheckedCreateInput): Promise<CallRow> {
    return this.prisma.callLog.create({ data, include: CALL_INCLUDE });
  }

  update(id: string, data: Prisma.CallLogUncheckedUpdateInput): Promise<CallRow> {
    return this.prisma.callLog.update({ where: { id }, data, include: CALL_INCLUDE });
  }

  /**
   * Moves a call only from the status it is expected to be in.
   *
   * The conditional update is the whole protection against out-of-order provider events: two
   * deliveries racing each other both read `RINGING`, both try to move it, and exactly one
   * matches. The loser gets a count of zero and stands down rather than overwriting the winner.
   */
  async transition(
    id: string,
    from: CallStatus,
    data: Prisma.CallLogUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const result = await this.prisma.callLog.updateMany({ where: { id, status: from }, data });
    return result.count === 1;
  }

  /**
   * Claims the right to make the next attempt.
   *
   * Same primitive the router uses to claim a routing attempt: the update matches only while the
   * counter still holds the value the caller read, so two workers walking the fallback ladder at
   * once cannot both ring somebody. The unique index on (call_id, sequence) is the backstop.
   */
  async claimAttempt(id: string, expected: number): Promise<number | null> {
    const result = await this.prisma.callLog.updateMany({
      where: { id, attemptCount: expected },
      data: { attemptCount: expected + 1 },
    });
    return result.count === 1 ? expected + 1 : null;
  }

  recordAttempt(data: Prisma.CallAttemptUncheckedCreateInput): Promise<CallAttemptRow> {
    return this.prisma.callAttempt.create({ data, include: { target: USER_REF } });
  }

  finishAttempt(id: string, data: Prisma.CallAttemptUncheckedUpdateInput): Promise<{ id: string }> {
    return this.prisma.callAttempt.update({ where: { id }, data, select: { id: true } });
  }

  /** The attempt a provider event is about: the latest one that has not finished. */
  liveAttempt(
    callId: string,
  ): Promise<{ id: string; sequence: number; targetUserId: string | null } | null> {
    return this.prisma.callAttempt.findFirst({
      where: { callId, endedAt: null },
      orderBy: { sequence: 'desc' },
      select: { id: true, sequence: true, targetUserId: true },
    });
  }

  /** Everybody this call has already rung. Nobody is rung twice for one call. */
  async triedTargets(callId: string): Promise<string[]> {
    const rows = await this.prisma.callAttempt.findMany({
      where: { callId, targetUserId: { not: null } },
      select: { targetUserId: true },
    });
    return rows.map((row) => row.targetUserId).filter((id): id is string => id !== null);
  }

  /**
   * The number to reach the person who reported the problem on, before masking.
   *
   * Read here rather than through the ticket include because `ticketSummaryInclude` is on the hot
   * path of every ticket screen in the product, and a telephone number is not something to start
   * carrying into ninety-six call sites for the sake of one. The external reporter comes first:
   * when a product raised the ticket on somebody's behalf, that somebody is who to ring.
   */
  async clientPhoneOf(ticket: {
    requesterId: string | null;
    externalRequesterId: string | null;
  }): Promise<string | null> {
    if (ticket.externalRequesterId) {
      const external = await this.prisma.externalRequester.findUnique({
        where: { id: ticket.externalRequesterId },
        select: { phone: true },
      });
      if (external?.phone) {
        return external.phone;
      }
    }
    if (!ticket.requesterId) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ticket.requesterId },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  /** The caller's role on a project, for the recording decision. Null when they are not on it. */
  async projectRoleOf(projectId: string, userId: string): Promise<string | null> {
    const row = await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
      select: { role: true },
    });
    return row?.role ?? null;
  }
}
