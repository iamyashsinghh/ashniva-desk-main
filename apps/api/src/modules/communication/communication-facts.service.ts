import { Injectable } from '@nestjs/common';
import { needsSharedWork, type AuthenticatedUser, type ProjectMemberRole } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { TaskChatScopeService } from '../tasks/task-chat-scope.service';
import type { TaskScope } from '../tasks/task-visibility.service';
import type { CommunicationContext } from './communication-policy.service';
import { MessagingScopeService } from './messaging-scope.service';

/** The project-anchored facts of a whole page, keyed so a decision can look its own ones up. */
export interface ProjectFacts {
  /** Project id → the actor's role there. */
  actorRoles: Map<string, ProjectMemberRole>;
  /** `<projectId>:<userId>` → that person's role there. */
  counterpartRoles: Map<string, ProjectMemberRole>;
  /** `<projectId>:<userId>` for every pair a task or a testing assignment ties to the actor. */
  sharedWork: Set<string>;
  /**
   * The ids of the tasks on this page the actor actually has a relationship with.
   *
   * Resolved for the whole page in one query (plus the two the scope itself costs) rather than per
   * row, because a permission call inside the list loop is what the list was tuned to remove.
   */
  relatedTasks: Set<string>;
}

/**
 * The live rows a decision is made from, gathered for a whole page at a time.
 *
 * Split out of `CommunicationPolicyService` because the two jobs are different and only one of
 * them is the judgement: that file decides and audits, this one reads. Keeping them apart is also
 * what makes the batching safe to look at — every query in this file answers a question
 * `canCommunicate` was going to ask anyway, and none of them decides anything.
 *
 * Nothing here is cached across requests. The whole package rests on yesterday's answer not being
 * today's, and a resolver is a snapshot for one request.
 */
@Injectable()
export class CommunicationFactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: MessagingScopeService,
    private readonly taskChatScope: TaskChatScopeService,
  ) {}

  /**
   * The roles several people hold on one project, right now.
   *
   * Not cached, not carried on a session, not inferred from a participant row, because the whole
   * point is that yesterday's answer is not today's — but asked for everybody at once, because a
   * conversation's participant list used to cost a query a head.
   */
  async projectRoles(
    projectId: string | null,
    userIds: readonly string[],
  ): Promise<Map<string, ProjectMemberRole>> {
    if (projectId === null || userIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        userId: { in: [...userIds] },
        // A deactivated or deleted account is not a member, whatever the membership row says.
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true, role: true },
    });
    return new Map(rows.map((row) => [row.userId, row.role as ProjectMemberRole]));
  }

  /** One person's role on one project. */
  async projectRole(projectId: string | null, userId: string): Promise<ProjectMemberRole | null> {
    return (await this.projectRoles(projectId, [userId])).get(userId) ?? null;
  }

  /**
   * The actor's role on each named project, and the counterparts' roles, in three queries.
   *
   * Two membership reads for the whole page, and the shared-work lookup only for the pairs whose
   * roles actually consult it. Contexts with no project take part in none of it.
   */
  async projectFactsFor(
    actor: AuthenticatedUser,
    contexts: readonly CommunicationContext[],
    taskChatScope?: TaskScope,
  ): Promise<ProjectFacts> {
    const anchored = contexts.filter((context) => context.projectId !== null);
    const empty: ProjectFacts = {
      actorRoles: new Map(),
      counterpartRoles: new Map(),
      sharedWork: new Set(),
      relatedTasks: new Set(),
    };
    if (anchored.length === 0) {
      return empty;
    }

    const projectIds = [...new Set(anchored.map((context) => context.projectId as string))];
    const counterpartIds = [
      ...new Set(
        anchored
          .map((context) => context.withUserId)
          .filter((userId): userId is string => userId !== undefined),
      ),
    ];

    // Every task this page hangs a conversation off. Being on the project is not being on the
    // task, so the tasks named here are resolved against the actor's task-chat scope — once, for
    // all of them — and a context whose task is missing from the answer is refused below.
    const taskIds = [
      ...new Set(
        anchored
          .map((context) => context.taskId)
          .filter((taskId): taskId is string => typeof taskId === 'string'),
      ),
    ];

    const [actorRows, counterpartRows, relatedTasks] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: {
          projectId: { in: projectIds },
          userId: actor.userId,
          // A deactivated or deleted account is not a member, whatever the membership row says.
          user: { deletedAt: null, status: 'ACTIVE' },
        },
        select: { projectId: true, role: true },
      }),
      counterpartIds.length > 0
        ? this.prisma.projectMember.findMany({
            // The cross product of the projects and the people this page names, filtered down to
            // the pairs that were actually asked about below. One query instead of one per pair.
            where: {
              projectId: { in: projectIds },
              userId: { in: counterpartIds },
              user: { deletedAt: null, status: 'ACTIVE' },
            },
            select: { projectId: true, userId: true, role: true },
          })
        : Promise.resolve([]),
      // The scope costs two queries, and the conversation list has already paid for them: it needs
      // the same predicate to build its page with. So a caller that holds one hands it over, and
      // only a caller that does not — the by-id paths — resolves it here.
      taskChatScope
        ? this.taskChatScope.relatedTaskIdsInScope(taskChatScope, actor.organizationId, taskIds)
        : this.taskChatScope.relatedTaskIds(actor, taskIds),
    ]);

    const facts: ProjectFacts = {
      actorRoles: new Map(actorRows.map((row) => [row.projectId, row.role as ProjectMemberRole])),
      counterpartRoles: new Map(
        counterpartRows.map((row) => [
          `${row.projectId}:${row.userId}`,
          row.role as ProjectMemberRole,
        ]),
      ),
      sharedWork: new Set<string>(),
      relatedTasks,
    };

    // Only the pairs whose two roles actually consult it. `pairingFor` reads
    // `sharedWorkRelationship` under `needsSharedWork` and nowhere else, so every other pair would
    // have paid for an answer that was never looked at.
    const asking = anchored.filter((context) => {
      if (!context.withUserId) {
        return false;
      }
      const actorRole = facts.actorRoles.get(context.projectId as string);
      const counterpartRole = facts.counterpartRoles.get(
        `${context.projectId as string}:${context.withUserId}`,
      );
      return (
        actorRole !== undefined &&
        counterpartRole !== undefined &&
        needsSharedWork(actorRole, counterpartRole)
      );
    });
    if (asking.length === 0) {
      return facts;
    }

    const askingProjectIds = [...new Set(asking.map((context) => context.projectId as string))];
    const askingUserIds = [...new Set(asking.map((context) => context.withUserId as string))];
    const [tasks, assignments] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          projectId: { in: askingProjectIds },
          deletedAt: null,
          OR: [
            { assignedToId: actor.userId, testerId: { in: askingUserIds } },
            { assignedToId: { in: askingUserIds }, testerId: actor.userId },
          ],
        },
        select: { projectId: true, assignedToId: true, testerId: true },
      }),
      this.prisma.testingAssignment.findMany({
        where: {
          projectId: { in: askingProjectIds },
          OR: [
            { assignedToUserId: actor.userId, task: { assignedToId: { in: askingUserIds } } },
            { assignedToUserId: { in: askingUserIds }, task: { assignedToId: actor.userId } },
          ],
        },
        select: {
          projectId: true,
          assignedToUserId: true,
          task: { select: { assignedToId: true } },
        },
      }),
    ]);
    for (const task of tasks) {
      const other = task.assignedToId === actor.userId ? task.testerId : task.assignedToId;
      if (other) {
        facts.sharedWork.add(`${task.projectId}:${other}`);
      }
    }
    for (const assignment of assignments) {
      const other =
        assignment.assignedToUserId === actor.userId
          ? (assignment.task?.assignedToId ?? null)
          : assignment.assignedToUserId;
      if (other) {
        facts.sharedWork.add(`${assignment.projectId}:${other}`);
      }
    }
    return facts;
  }

  /** Who, of everybody these contexts name, is inside the actor's management reach. One lookup. */
  async scopeFactsFor(
    actor: AuthenticatedUser,
    contexts: readonly CommunicationContext[],
  ): Promise<Map<string, string>> {
    const named = [
      ...new Set(contexts.flatMap((context) => [...(context.scope?.counterpartIds ?? [])])),
    ];
    if (named.length === 0) {
      return new Map();
    }
    if (named.includes(actor.userId)) {
      // A conversation with yourself is not a scope question. Refusing here keeps the resolver
      // honest without the endpoints having to remember; they refuse it with a clearer message.
      return new Map();
    }
    return this.scope.reachable(actor, named);
  }
}
