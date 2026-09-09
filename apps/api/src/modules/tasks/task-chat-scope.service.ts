import { Injectable } from '@nestjs/common';
import { PROJECT_MEMBER_ROLE, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { taskScopeClauses, type TaskScope } from './task-visibility.service';

/** The two project roles that carry authority over a project rather than a place on it. */
const SENIOR_PROJECT_ROLES = [PROJECT_MEMBER_ROLE.MANAGER, PROJECT_MEMBER_ROLE.LEAD];

/**
 * A resolved task-chat scope as a Prisma predicate.
 *
 * Always a predicate, never `undefined` — unlike `taskScopeWhere`, whose `undefined` means "this
 * caller may read every task in the tenant". Nobody's task-*chat* scope is the whole organization,
 * so there is no caller for whom the filter can be dropped, and returning something droppable would
 * be an invitation to drop it.
 */
export function taskChatWhere(scope: TaskScope): Prisma.TaskWhereInput {
  return { OR: taskScopeClauses(scope) };
}

/**
 * Who belongs in a task's *conversation*, which is narrower than who may read the task.
 *
 * `TaskVisibilityService` answers "may this person read this task", and its answer includes every
 * member of the task's project: a developer on ACME may open any ACME task, see its status, its
 * description and its comments. That is the right answer for a work item — a colleague needs to be
 * able to look at the work — and it is the wrong answer for the chat hanging off it. UAT found the
 * difference the hard way: a developer was being shown the task conversations of tasks that were
 * not theirs, on projects they merely belonged to, because the communication policy decided a
 * `TASK` conversation on project membership alone.
 *
 * **A conversation is not a record, it is a room.** Reading a task tells you what the work is;
 * reading its thread tells you what the people doing it said to each other while doing it. So chat
 * asks for a relationship with the *task*, and this file is the one place that narrower predicate
 * is derived.
 *
 * ## The rule
 *
 *  * **A place on the work** — assignee, creator, reviewer, tester, or the person a live
 *    `TestingAssignment` was handed to. Exactly the five relations `TaskVisibilityService` calls
 *    "own", and for the same reason: they are the ways the schema records that a task is somebody's.
 *  * **Authority over the work** — the tasks of projects the actor manages or leads
 *    (`projects.manager_user_id`, `projects.lead_user_id`, or a `MANAGER`/`LEAD` row in
 *    `project_members`), and of projects belonging to a team they lead (`teams.lead_user_id`).
 *  * **Authority over the people** — the tasks of the members of teams they lead, which is the
 *    same "team" clause `TaskVisibilityService` already resolves.
 *
 * ## What is deliberately *not* here
 *
 * **Plain project membership.** It admits everybody to everything and is the defect.
 *
 * **`task:read-all`.** A project manager holds it and it makes their task *list* the whole tenant.
 * It is a grant to read work, not a place in every private discussion of it, and treating it as one
 * would put the manager of one project in every other project's task threads. A manager's chat
 * reach is what they manage and lead, resolved from relations rather than from a permission.
 *
 * **Oversight.** A super admin reaches every conversation through `conversation:inspect`, which is
 * read-only and audited with `viaOversight`, and that path is untouched by this file. Widening the
 * ordinary scope for them would have quietly turned an audited inspection into ordinary reading.
 *
 * The predicate itself is built by `taskScopeClauses`, the same relations the task list uses. Only
 * the *set of projects* differs, so there is one shape of task-scope query in the codebase and one
 * place — this file — that says why chat's is narrower.
 */
@Injectable()
export class TaskChatScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The actor’s task-chat scope, in two queries.
   *
   * `organizationWide` is always false, and that is the point: there is no permission that puts
   * somebody in every task conversation in the tenant. The one tenant-wide reader is the inspector,
   * and they arrive through oversight rather than through here.
   */
  async resolve(actor: AuthenticatedUser): Promise<TaskScope> {
    const [teamMembers, projects] = await Promise.all([
      // The members, through the team, rather than the teams and then their members: Prisma issues
      // a second statement for a nested list select even when the outer query matched nothing, so
      // asking this way costs one query for everybody instead of two for the people who lead no
      // team at all — which is most people, on every conversation list they load.
      this.prisma.teamMember.findMany({
        where: {
          team: {
            organizationId: actor.organizationId,
            deletedAt: null,
            leadUserId: actor.userId,
          },
        },
        select: { userId: true },
      }),
      this.prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [
            { managerUserId: actor.userId },
            { leadUserId: actor.userId },
            { members: { some: { userId: actor.userId, role: { in: SENIOR_PROJECT_ROLES } } } },
            // A project handed to a team the actor leads. Resolved through the relation rather
            // than by reading the led teams' ids first, so the whole scope stays two queries.
            { team: { deletedAt: null, leadUserId: actor.userId } },
          ],
        },
        select: { id: true },
      }),
    ]);
    const userIds = new Set<string>([actor.userId]);
    for (const member of teamMembers) {
      userIds.add(member.userId);
    }
    return {
      organizationWide: false,
      userIds: [...userIds],
      projectIds: projects.map((project) => project.id),
    };
  }

  /**
   * Which of these tasks the actor has a relationship with, in one query however many are named.
   *
   * The conversation list asks this once for a whole page rather than once per row: a permission
   * call inside a loop is how the list that was tuned from thirty-one queries to ten goes back to
   * thirty-one.
   */
  async relatedTaskIds(actor: AuthenticatedUser, taskIds: readonly string[]): Promise<Set<string>> {
    if (taskIds.length === 0) {
      return new Set();
    }
    const scope = await this.resolve(actor);
    return this.relatedTaskIdsInScope(scope, actor.organizationId, taskIds);
  }

  /** The same question against a scope the caller already resolved. */
  async relatedTaskIdsInScope(
    scope: TaskScope,
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<Set<string>> {
    if (taskIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.task.findMany({
      where: { id: { in: [...taskIds] }, organizationId, deletedAt: null, ...taskChatWhere(scope) },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  /**
   * The inverse question: who belongs in *this* task's conversation.
   *
   * The exact mirror of the predicate above, and it has to stay one — a person the predicate admits
   * but this list omits could read the thread and never be told a message arrived in it, and a
   * person this list names but the predicate refuses would be pushed message bodies they cannot
   * open. Each clause below is one clause of the rule, read backwards.
   *
   * Candidates only. Whether each is a live account, still on the project and still holding
   * `conversation:participate` is `ConversationAudienceService`'s question, asked once for every
   * kind of conversation rather than once here and differently there.
   */
  async audienceFor(task: {
    id: string;
    organizationId: string;
    projectId: string;
    assignedToId: string | null;
    createdById: string;
    reviewerId: string | null;
    testerId: string | null;
  }): Promise<string[]> {
    const [testers, project] = await Promise.all([
      this.prisma.testingAssignment.findMany({
        where: { taskId: task.id, deletedAt: null, assignedToUserId: { not: null } },
        select: { assignedToUserId: true },
      }),
      this.prisma.project.findUnique({
        where: { id: task.projectId },
        select: {
          managerUserId: true,
          leadUserId: true,
          team: { select: { leadUserId: true } },
          members: {
            where: { role: { in: SENIOR_PROJECT_ROLES } },
            select: { userId: true },
          },
        },
      }),
    ]);

    const onTask = [
      task.assignedToId,
      task.createdById,
      task.reviewerId,
      task.testerId,
      ...testers.map((row) => row.assignedToUserId),
    ].filter((value): value is string => value !== null);

    // Leads of the teams the people on this task belong to. Asked after the testing assignments
    // rather than beside them, because a tester who holds only an assignment is on the task too and
    // their lead has to be reached the same way the assignee's is.
    const teams =
      onTask.length > 0
        ? await this.prisma.team.findMany({
            where: {
              organizationId: task.organizationId,
              deletedAt: null,
              leadUserId: { not: null },
              members: { some: { userId: { in: onTask } } },
            },
            select: { leadUserId: true },
          })
        : [];

    const candidates = new Set<string>(onTask);
    for (const team of teams) {
      if (team.leadUserId) {
        candidates.add(team.leadUserId);
      }
    }
    for (const id of [project?.managerUserId, project?.leadUserId, project?.team?.leadUserId]) {
      if (id) {
        candidates.add(id);
      }
    }
    for (const member of project?.members ?? []) {
      candidates.add(member.userId);
    }
    return [...candidates];
  }
}
