import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const repositoryInclude = {
  project: { select: { id: true, code: true, name: true } },
} satisfies Prisma.RepositoryLinkInclude;

export type RepositoryLinkRow = Prisma.RepositoryLinkGetPayload<{
  include: typeof repositoryInclude;
}>;
export type CodeActivityRow = Prisma.CodeActivityGetPayload<object>;

/**
 * Repository links and development activity. Every method is organization-scoped as the first
 * layer; the RLS policies added in 20260906110000_phase3_git_integration are the second.
 */
@Injectable()
export class GitRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForProject(organizationId: string, projectId: string): Promise<RepositoryLinkRow[]> {
    return this.prisma.repositoryLink.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: repositoryInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(organizationId: string, id: string): Promise<RepositoryLinkRow | null> {
    return this.prisma.repositoryLink.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: repositoryInclude,
    });
  }

  /**
   * Used by the webhook path, which has no signed-in user and resolves the tenant from the row.
   *
   * Every match, not the first: uniqueness on `external_repo_id` is per connection, so two
   * organizations that both link the same repository each have their own row. Picking one
   * arbitrarily would attribute a delivery to whichever tenant the planner happened to return.
   * The caller decides between them by which secret verifies the signature.
   */
  findAllByExternalRepo(
    provider: 'GITHUB' | 'GITLAB',
    externalRepoId: string,
  ): Promise<RepositoryLinkRow[]> {
    return this.prisma.repositoryLink.findMany({
      where: { provider, externalRepoId, deletedAt: null },
      include: repositoryInclude,
    });
  }

  create(data: Prisma.RepositoryLinkUncheckedCreateInput): Promise<RepositoryLinkRow> {
    return this.prisma.repositoryLink.create({ data, include: repositoryInclude });
  }

  /** Soft delete, so the activity already collected keeps its parent row. */
  softDelete(id: string): Promise<RepositoryLinkRow> {
    return this.prisma.repositoryLink.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: repositoryInclude,
    });
  }

  markSynced(id: string, status: 'SUCCESS' | 'PARTIAL' | 'FAILED'): Promise<RepositoryLinkRow> {
    return this.prisma.repositoryLink.update({
      where: { id },
      data: { lastSyncAt: new Date(), lastSyncStatus: status },
      include: repositoryInclude,
    });
  }

  activityForTask(
    organizationId: string,
    taskId: string,
    taskScope?: Prisma.TaskWhereInput,
  ): Promise<CodeActivityRow[]> {
    return this.prisma.codeActivity.findMany({
      // The task predicate rather than a check on the id afterwards: the branch names, commit
      // messages and pull-request titles here are the developer's own words about work the caller
      // may not be able to open.
      where: { organizationId, taskId, ...(taskScope ? { task: taskScope } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  activityForProject(
    organizationId: string,
    projectId: string,
    limit: number,
  ): Promise<CodeActivityRow[]> {
    return this.prisma.codeActivity.findMany({
      where: { organizationId, repositoryLink: { projectId, deletedAt: null } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Stores one activity, ignoring a repeat.
   *
   * The unique index on (repository_link_id, kind, external_id) means a redelivered webhook or an
   * overlapping manual sync cannot create a second row for the same commit — `skipDuplicates`
   * turns that collision into a no-op rather than an error the caller has to interpret.
   */
  async upsertActivities(rows: Prisma.CodeActivityUncheckedCreateInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.codeActivity.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  /** Resolves task references to task ids, inside one organization. */
  async resolveTasks(
    organizationId: string,
    projectId: string,
    numbers: number[],
    keyed: { code: string; number: number }[],
  ): Promise<string[]> {
    const clauses: Prisma.TaskWhereInput[] = [];
    if (numbers.length > 0) {
      // A bare TSK-### means "in this repository's project".
      clauses.push({ projectId, number: { in: numbers } });
    }
    for (const entry of keyed) {
      clauses.push({ project: { code: entry.code }, number: entry.number });
    }
    if (clauses.length === 0) {
      return [];
    }
    const tasks = await this.prisma.task.findMany({
      where: { organizationId, deletedAt: null, OR: clauses },
      select: { id: true },
      take: 50,
    });
    return tasks.map((task) => task.id);
  }
}
