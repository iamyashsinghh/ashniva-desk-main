import { Injectable } from '@nestjs/common';
import {
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  type AuthenticatedUser,
  type CommunicationContact,
  type MessagingScopeContact,
  type ProjectMemberRole,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { CommunicationPolicyService, assertInternalActor } from './communication-policy.service';
import { anchorKeyFor, directKeyFor } from './communication.mapper';
import { ConversationsRepository } from './conversations.repository';
import { MessagingScopeService } from './messaging-scope.service';

/** How many project memberships one directory request will consider. */
const CANDIDATE_LIMIT = 500;

/**
 * Who the caller may start a conversation with, by either route.
 *
 * Both lists are **derived rather than stored**, and both are filtered through the very same
 * decision the create endpoint applies. A directory that showed somebody the caller could not then
 * message would be worse than no directory — it would advertise the existence of staff the
 * relationship rules are meant to keep separate.
 *
 * The project list used to cost roughly two queries per candidate — a policy resolution and a
 * lookup for an existing thread — and considered up to five hundred candidates, which made the
 * default view of the Messages screen a few thousand sequential round trips. It now resolves every
 * candidate's facts in one batch and looks up every existing thread in one query, so the cost is
 * flat in the size of the list.
 */
@Injectable()
export class CommunicationContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CommunicationPolicyService,
    private readonly conversations: ConversationsRepository,
    private readonly scope: MessagingScopeService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<CommunicationContact[]> {
    assertInternalActor(actor);
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId: actor.userId, project: { deletedAt: null } },
      select: { projectId: true, project: { select: { code: true } } },
    });
    if (memberships.length === 0) {
      return [];
    }

    const candidates = await this.prisma.projectMember.findMany({
      where: {
        projectId: { in: memberships.map((row) => row.projectId) },
        userId: { not: actor.userId },
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: {
        projectId: true,
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
      take: CANDIDATE_LIMIT,
    });
    if (candidates.length === 0) {
      return [];
    }

    // One resolution for the whole list, then the same decision per candidate in memory. The
    // answers are identical to asking one at a time; only the number of round trips changed.
    const resolvers = await this.policy.resolveMany(
      actor,
      candidates.map((candidate) => ({
        projectId: candidate.projectId,
        withUserId: candidate.user.id,
      })),
    );
    const allowed = candidates.filter(
      (_, index) => resolvers[index]?.decide(COMMUNICATION_ACTION.CREATE).allowed === true,
    );

    // And one query for every thread that already exists, keyed by the same anchor the create
    // endpoint would compute.
    const anchorKeys = new Map(
      allowed.map((candidate) => [
        candidate,
        anchorKeyFor({
          kind: CONVERSATION_KIND.DIRECT,
          projectId: candidate.projectId,
          directKey: directKeyFor(actor.userId, candidate.user.id),
        }),
      ]),
    );
    const existing = await this.conversations.findByAnchors(actor.organizationId, [
      ...anchorKeys.values(),
    ]);

    const codes = new Map(memberships.map((row) => [row.projectId, row.project.code]));
    return allowed.map((candidate) => ({
      ...candidate.user,
      projectId: candidate.projectId,
      projectCode: codes.get(candidate.projectId) ?? '',
      projectRole: candidate.role as ProjectMemberRole,
      conversationId: existing.get(anchorKeys.get(candidate) as string)?.id ?? null,
    }));
  }

  /**
   * The messaging directory: who the caller may reach when there is no project between them.
   *
   * The scope itself comes from `MessagingScopeService` and nowhere else. What this adds is the
   * existing thread, looked up by the same anchor `POST /conversations/direct` computes, so the
   * screen can open a conversation rather than start a second one.
   */
  async directory(actor: AuthenticatedUser, search?: string): Promise<MessagingScopeContact[]> {
    assertInternalActor(actor);
    const contacts = await this.scope.directory(actor, search);
    if (contacts.length === 0) {
      return [];
    }
    const anchorKeys = new Map(
      contacts.map((contact) => [
        contact.id,
        anchorKeyFor({
          kind: CONVERSATION_KIND.SCOPE_DIRECT,
          directKey: directKeyFor(actor.userId, contact.id),
        }),
      ]),
    );
    const existing = await this.conversations.findByAnchors(actor.organizationId, [
      ...anchorKeys.values(),
    ]);
    return contacts.map((contact) => ({
      ...contact,
      conversationId: existing.get(anchorKeys.get(contact.id) as string)?.id ?? null,
    }));
  }
}
