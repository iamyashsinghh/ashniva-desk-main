import { ForbiddenException, Injectable } from '@nestjs/common';
import { PERMISSIONS, seesAllOrganizationProjects, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Which tasks one person may read, as data rather than as a rule scattered over the callers.
 *
 * Task visibility used to be the tenant and nothing else: every internal user could list, open and
 * edit every other person's task, including the internal comments, work-log text and proof URLs on
 * it. `task:read` said a person works with tasks; it never said whose.
 *
 * The scope is derived from relations that already exist. Nothing here invents a reporting line —
 * the schema has none, and adding one to answer a read question would be a data model built for a
 * permission check:
 *
 *  - **own** — assignee, creator, reviewer, tester, or the person a testing assignment was handed
 *    to. These are the ways the schema records that a task is somebody's;
 *  - **project** — every task on a project the person manages, leads or is a member of
 *    (`ProjectsRepository.list({ memberUserId })` selects exactly those three);
 *  - **team** — the people on teams the person *leads*. Being on a team with somebody is not
 *    authority over their work; leading it is;
 *  - **organization** — `task:read-all`, and only that. Decided from the permission set rather
 *    than from a list of role keys, so a tenant's custom role gets the same answer as a system one.
 *
 * One resolver, consumed by the list path, the by-id path, every write path and the websocket
 * audience, so those four cannot drift apart.
 */
export interface TaskScope {
  /** True when the actor may read every task in the tenant, and nothing needs narrowing. */
  organizationWide: boolean;
  /** People whose work the actor may read: themselves, plus the members of teams they lead. */
  userIds: string[];
  /** Projects the actor manages, leads or is a member of. */
  projectIds: string[];
}

/**
 * The scope as a Prisma predicate, or `undefined` when the actor may see everything.
 *
 * `undefined` rather than an empty object on purpose: an absent filter and a filter that matches
 * everything read the same at a call site, and one of them survives being spread into a `where`
 * that already has an `OR`.
 */
export function taskScopeWhere(scope: TaskScope): Prisma.TaskWhereInput | undefined {
  if (scope.organizationWide) {
    return undefined;
  }
  return { OR: taskScopeClauses(scope) };
}

/**
 * The scope as the list of relations that make a task somebody's, without the `OR` around it.
 *
 * Exported so that a caller whose scope is *never* organization-wide — task chat, whose narrower
 * project set `TaskChatScopeService` resolves — can build the same predicate without having to
 * handle an `undefined` it can never receive, and without writing a second list of what counts as
 * a relationship. One definition of "this task is yours"; two sets of projects around it.
 */
export function taskScopeClauses(scope: TaskScope): Prisma.TaskWhereInput[] {
  const or: Prisma.TaskWhereInput[] = [
    { assignedToId: { in: scope.userIds } },
    { createdById: { in: scope.userIds } },
    { reviewerId: { in: scope.userIds } },
    { testerId: { in: scope.userIds } },
    // Testing is handed out on its own row rather than on the task, so a tester who has been
    // given work would otherwise be unable to open the thing they were asked to test.
    {
      testingAssignments: {
        some: { assignedToUserId: { in: scope.userIds }, deletedAt: null },
      },
    },
  ];
  if (scope.projectIds.length > 0) {
    or.push({ projectId: { in: scope.projectIds } });
  }
  return or;
}

@Injectable()
export class TaskVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(actor: AuthenticatedUser): Promise<TaskScope> {
    if (
      actor.permissions.includes(PERMISSIONS.TASK_READ_ALL) &&
      seesAllOrganizationProjects(actor.roleKey)
    ) {
      return { organizationWide: true, userIds: [], projectIds: [] };
    }
    const [teams, projects] = await Promise.all([
      this.prisma.team.findMany({
        where: { organizationId: actor.organizationId, deletedAt: null, leadUserId: actor.userId },
        select: { members: { select: { userId: true } } },
      }),
      this.prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [
            { createdById: actor.userId },
            { managerUserId: actor.userId },
            { leadUserId: actor.userId },
            { members: { some: { userId: actor.userId } } },
            { team: { is: { leadUserId: actor.userId } } },
            { team: { is: { members: { some: { userId: actor.userId } } } } },
          ],
        },
        select: { id: true },
      }),
    ]);
    const userIds = new Set<string>([actor.userId]);
    for (const team of teams) {
      for (const member of team.members) {
        userIds.add(member.userId);
      }
    }
    return {
      organizationWide: false,
      userIds: [...userIds],
      projectIds: projects.map((project) => project.id),
    };
  }

  /** The predicate to `AND` into any task query made on the actor's behalf. */
  async taskWhere(actor: AuthenticatedUser): Promise<Prisma.TaskWhereInput | undefined> {
    const scope = await this.resolve(actor);
    const base = taskScopeWhere(scope);
    // Intern work is private to the person who assigned it, the intern, and Super Admin.
    const internGate: Prisma.TaskWhereInput = {
      OR: [
        { isInternTask: false },
        {
          isInternTask: true,
          OR: [{ createdById: actor.userId }, { assignedToId: actor.userId }],
        },
      ],
    };
    if (!base) {
      return undefined;
    }
    return { AND: [base, internGate] };
  }

  /**
   * The same scope for the rows that hang off a task and carry its content.
   *
   * A client update names the task it came from and repeats what was done; `GET /client-updates`
   * is gated on `task:read` alone, so the publish queue handed every developer the whole
   * organization's work. An update with no task belongs to its project, which is why the project
   * clause is here rather than only in the task predicate.
   */
  async clientUpdateWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.ClientUpdateWhereInput | undefined> {
    const scope = await this.resolve(actor);
    const tasks = taskScopeWhere(scope);
    if (!tasks) {
      return undefined;
    }
    return {
      OR: [
        { authorId: { in: scope.userIds } },
        { publishedById: { in: scope.userIds } },
        ...(scope.projectIds.length > 0 ? [{ projectId: { in: scope.projectIds } }] : []),
        { task: tasks },
      ],
    };
  }

  /**
   * Attachments: the proof screenshots and documents a developer files with a completion sheet.
   *
   * Only files hanging off a task are narrowed. A file on a ticket, project, contract, milestone,
   * change request or invoice is that thing's attachment and is governed by that thing's own
   * rules; pulling them into the task scope would hide a contract PDF from the person who
   * uploaded it.
   */
  async fileWhere(actor: AuthenticatedUser): Promise<Prisma.FileWhereInput | undefined> {
    const tasks = await this.taskWhere(actor);
    return tasks ? { OR: [{ taskId: null }, { task: tasks }] } : undefined;
  }

  /**
   * The QA queue. Six of the nine tester views ask about the organization rather than about the
   * caller, so they listed every assignment in the tenant with the task title and payload on it.
   * An assignment handed to the caller is theirs to see whatever the task scope says, which is
   * what the first clause is for.
   */
  async testingAssignmentWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.TestingAssignmentWhereInput | undefined> {
    const scope = await this.resolve(actor);
    const tasks = taskScopeWhere(scope);
    if (!tasks) {
      return undefined;
    }
    return {
      OR: [
        { assignedToUserId: actor.userId },
        { assignedById: actor.userId },
        ...(scope.projectIds.length > 0 ? [{ projectId: { in: scope.projectIds } }] : []),
        { task: tasks },
      ],
    };
  }

  /**
   * The people the actor may name in an `assignedToId` filter.
   *
   * Wider than `TaskScope.userIds`, and deliberately so: the scope answers "whose task is this",
   * while this answers "whose name may appear in my filter". A developer may narrow their own
   * project's list to a colleague on that project without being able to open that colleague's
   * unrelated work. `undefined` means "anybody" — the organization-wide reader.
   */
  async filterablePeople(actor: AuthenticatedUser): Promise<Set<string> | undefined> {
    const scope = await this.resolve(actor);
    if (scope.organizationWide) {
      return undefined;
    }
    const people = new Set(scope.userIds);
    if (scope.projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: scope.projectIds } },
        select: { managerUserId: true, leadUserId: true, members: { select: { userId: true } } },
      });
      for (const project of projects) {
        if (project.managerUserId) {
          people.add(project.managerUserId);
        }
        if (project.leadUserId) {
          people.add(project.leadUserId);
        }
        for (const member of project.members) {
          people.add(member.userId);
        }
      }
    }
    return people;
  }

  /**
   * The inverse question, for the `task.updated` websocket event: who may hear about this task.
   *
   * The event used to go to the organization room — every signed-in member of the tenant, told the
   * id, project and status of work most of them may not open. This computes the audience at emit
   * time from the same relations the scope reads, so a socket that connected before somebody left
   * a project cannot keep receiving that project's events.
   *
   * Everybody it returns is an active member of the task's organization, so a client contact who
   * sits on the project as a `CLIENT_CONTACT` is not in the list.
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
    const onTask = [task.assignedToId, task.createdById, task.reviewerId, task.testerId].filter(
      (value): value is string => value !== null,
    );
    const [testers, teams, project, wide] = await Promise.all([
      this.prisma.testingAssignment.findMany({
        where: { taskId: task.id, deletedAt: null, assignedToUserId: { not: null } },
        select: { assignedToUserId: true },
      }),
      this.prisma.team.findMany({
        where: {
          organizationId: task.organizationId,
          deletedAt: null,
          leadUserId: { not: null },
          members: { some: { userId: { in: onTask } } },
        },
        select: { leadUserId: true },
      }),
      this.prisma.project.findUnique({
        where: { id: task.projectId },
        select: { managerUserId: true, leadUserId: true, members: { select: { userId: true } } },
      }),
      this.organizationWideReaders(task.organizationId),
    ]);
    const candidates = new Set<string>([...onTask, ...wide]);
    for (const row of testers) {
      if (row.assignedToUserId) {
        candidates.add(row.assignedToUserId);
      }
    }
    for (const team of teams) {
      if (team.leadUserId) {
        candidates.add(team.leadUserId);
      }
    }
    for (const id of [project?.managerUserId, project?.leadUserId]) {
      if (id) {
        candidates.add(id);
      }
    }
    for (const member of project?.members ?? []) {
      candidates.add(member.userId);
    }
    return this.activeMembers(task.organizationId, [...candidates]);
  }

  /** Active members of the organization whose role grants `task:read-all`. */
  private async organizationWideReaders(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
        role: { permissions: { some: { permission: { key: PERMISSIONS.TASK_READ_ALL } } } },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private async activeMembers(organizationId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /**
   * Refuses an `assignedToId` filter naming somebody the actor has no business asking about.
   *
   * The scope predicate would already return nothing useful, but an empty list and a refusal say
   * different things: silently narrowing turns "you may not ask this" into "this person has no
   * work", which is an answer, and a wrong one.
   */
  async assertMayFilterBy(
    actor: AuthenticatedUser,
    assignedToId: string | undefined,
  ): Promise<void> {
    if (!assignedToId || assignedToId === actor.userId) {
      return;
    }
    const people = await this.filterablePeople(actor);
    if (people && !people.has(assignedToId)) {
      throw new ForbiddenException('You cannot see this person’s tasks');
    }
  }
}
