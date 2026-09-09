import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  type AuthenticatedUser,
  type ConversationCallSummary,
  type ConversationSummary,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { toConversationSummary } from './communication.mapper';
import { ConversationsRepository } from './conversations.repository';

/**
 * Super-admin oversight.
 *
 * Deliberately its own surface rather than a widening of the ordinary endpoints. Two reasons, and
 * both matter:
 *
 *  * **It is visible.** Inspecting is a different URL and a different permission, so nobody
 *    reaches a colleague's private conversation by accident while browsing their own.
 *  * **It is recorded.** Every call here writes an audit row naming the inspector, the
 *    conversation and the moment. Oversight that leaves no trace is indistinguishable from a
 *    breach, and the requirement is explicit that it must not be invisible.
 *
 * What it does not do: reach another tenant. An inspection is still bounded by `organizationId`,
 * and the row-level policy enforces that underneath the service.
 */
@Injectable()
export class OversightService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly policy: CommunicationPolicyService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async conversationsFor(
    actor: AuthenticatedUser,
    filter: { projectId?: string; limit?: number },
  ): Promise<ConversationSummary[]> {
    await this.assertInspector(actor, filter.projectId ?? null);
    const rows = await this.conversations.listAll(actor.organizationId, {
      projectId: filter.projectId,
      limit: filter.limit ?? 50,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_INSPECTED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: filter.projectId ?? actor.organizationId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { scope: 'list', projectId: filter.projectId ?? null, returned: rows.length },
    });

    const previews = await this.conversations.previews(rows.map((row) => row.id));
    return rows.map((row) =>
      toConversationSummary(row, actor.userId, {
        // An inspector's unread count is meaningless — they are not a participant — and showing
        // one would suggest they are expected to keep up with somebody else's conversation.
        unreadCount: 0,
        preview: previews.get(row.id),
      }),
    );
  }

  /** Call history across the organization, or one project. Audited like everything else here. */
  async callsFor(
    actor: AuthenticatedUser,
    filter: { projectId?: string; limit?: number },
  ): Promise<ConversationCallSummary[]> {
    await this.assertInspector(actor, filter.projectId ?? null);
    const rows = await this.prisma.callLog.findMany({
      where: {
        organizationId: actor.organizationId,
        kind: 'INTERNAL',
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: filter.limit ?? 50,
      include: {
        initiatedBy: { select: { id: true, name: true, email: true } },
        participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_INSPECTED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: filter.projectId ?? actor.organizationId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { scope: 'calls', projectId: filter.projectId ?? null, returned: rows.length },
    });

    return rows.map((call) => ({
      id: call.id,
      conversationId: call.conversationId,
      status: call.status,
      startedAt: call.requestedAt.toISOString(),
      endedAt: call.endedAt?.toISOString() ?? null,
      durationSeconds: call.durationSeconds,
      initiatedBy: call.initiatedBy,
      participants: call.participants.map((participant) => participant.user),
      hasRecording: call.recordingRef !== null,
      // Availability, not permission: playing it runs the recording service's own two gates, and
      // this list must not imply an inspector may listen without them.
      canPlayRecording: false,
    }));
  }

  private async assertInspector(actor: AuthenticatedUser, projectId: string | null): Promise<void> {
    const decision = await this.policy.decide(actor, COMMUNICATION_ACTION.INSPECT, {
      // A project id only narrows the listing; the permission is organization-wide, and using a
      // project the inspector happens to be on must not change the answer.
      projectId: projectId ?? actor.organizationId,
    });
    if (!decision.allowed) {
      throw new ForbiddenException('Oversight needs the conversation:inspect permission');
    }
  }
}
