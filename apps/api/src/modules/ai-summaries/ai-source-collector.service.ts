import { Injectable } from '@nestjs/common';
import { AI_SOURCE_KIND, type AiSourceKind, type AiSummaryType } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { isAuthorisedSource, type RawSource } from './source-selection';

/**
 * Reading the records a summary is grounded in.
 *
 * Every query here is tenant-scoped and every query is gated on `isAuthorisedSource`, so a
 * summary type that has no business reading work logs does not issue the query at all — rather
 * than issuing it and filtering afterwards, which is the shape of mistake that survives a
 * refactor.
 *
 * `take` caps exist on every query. A generation run over a wide period should produce a partial
 * summary with a note saying so, not a prompt the size of a database.
 */

export interface CollectionScope {
  organizationId: string;
  type: AiSummaryType;
  projectId: string | null;
  subjectUserId: string | null;
  ticketId: string | null;
  /** Inclusive. */
  periodStart: Date;
  /** Exclusive, so a day-long period is [day, day+1). */
  periodEnd: Date;
}

const TAKE = 200;

@Injectable()
export class AiSourceCollectorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the summary is allowed to read, unsanitised and unordered. */
  async collect(scope: CollectionScope): Promise<RawSource[]> {
    const parts = await Promise.all([
      this.tasks(scope),
      this.statusChanges(scope),
      this.workLogs(scope),
      this.tickets(scope),
      this.clientUpdates(scope),
      this.milestones(scope),
      this.codeActivity(scope),
      this.releaseNotes(scope),
    ]);
    return parts.flat();
  }

  private allowed(scope: CollectionScope, kind: AiSourceKind): boolean {
    return isAuthorisedSource(scope.type, kind);
  }

  private window(scope: CollectionScope) {
    return { gte: scope.periodStart, lt: scope.periodEnd };
  }

  private async tasks(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.TASK)) {
      return [];
    }
    const rows = await this.prisma.task.findMany({
      where: {
        organizationId: scope.organizationId,
        deletedAt: null,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.subjectUserId ? { assignedToId: scope.subjectUserId } : {}),
        OR: [{ updatedAt: this.window(scope) }, { completedAt: this.window(scope) }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        clientVisible: true,
        completedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.TASK,
      refId: row.id,
      label: `${row.title} [${row.status}]`,
      // The title only. A task's description can hold internal detail and estimates, and nothing
      // needs it to say what was worked on.
      text: null,
      occurredAt: row.completedAt ?? row.updatedAt,
      clientVisible: row.clientVisible && row.status === 'COMPLETED',
    }));
  }

  private async statusChanges(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.TASK_STATUS_CHANGE)) {
      return [];
    }
    const rows = await this.prisma.taskStatusHistory.findMany({
      where: {
        createdAt: this.window(scope),
        task: {
          organizationId: scope.organizationId,
          deletedAt: null,
          ...(scope.projectId ? { projectId: scope.projectId } : {}),
          ...(scope.subjectUserId ? { assignedToId: scope.subjectUserId } : {}),
        },
      },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        note: true,
        createdAt: true,
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.TASK_STATUS_CHANGE,
      refId: row.task.id,
      label: `${row.task.title}: ${row.fromStatus ?? 'new'} → ${row.toStatus}`,
      // Never client-visible. `note` carries block reasons and review outcomes, which are
      // internal by nature. TASK_STATUS_CHANGE *is* an authorised source for PROJECT_PROGRESS,
      // which is client-facing — so this flag, not the allow-list, is what keeps it out of a
      // client prompt. `prepareSources` drops it there and reports the count to the reviewer.
      text: row.note,
      occurredAt: row.createdAt,
      clientVisible: false,
    }));
  }

  private async workLogs(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.WORK_LOG)) {
      return [];
    }
    const rows = await this.prisma.workLog.findMany({
      where: {
        organizationId: scope.organizationId,
        workDate: this.window(scope),
        ...(scope.subjectUserId ? { userId: scope.subjectUserId } : {}),
        ...(scope.projectId ? { task: { projectId: scope.projectId } } : {}),
        ...(scope.ticketId ? { task: { ticketId: scope.ticketId } } : {}),
      },
      select: {
        id: true,
        summary: true,
        minutes: true,
        workDate: true,
        task: { select: { id: true, title: true } },
      },
      orderBy: { workDate: 'asc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.WORK_LOG,
      refId: row.task.id,
      label: `${row.task.title} — ${row.minutes} minutes logged`,
      text: row.summary,
      occurredAt: row.workDate,
      // Time spent is internal. It is never a source for a client-facing summary.
      clientVisible: false,
    }));
  }

  private async tickets(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.TICKET)) {
      return [];
    }
    const rows = await this.prisma.ticket.findMany({
      where: {
        organizationId: scope.organizationId,
        deletedAt: null,
        ...(scope.ticketId ? { id: scope.ticketId } : {}),
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.subjectUserId ? { assignedToId: scope.subjectUserId } : {}),
        ...(scope.ticketId ? {} : { updatedAt: this.window(scope) }),
      },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        priority: true,
        resolution: true,
        resolvedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.TICKET,
      refId: row.id,
      label: `T-${row.number} ${row.title} [${row.status}, ${row.priority}]`,
      // The resolution is what was told to the requester, so it is the one ticket text field
      // that carries over. Internal replies and triage notes are not read at all.
      text: row.resolution,
      occurredAt: row.resolvedAt ?? row.updatedAt,
      clientVisible: false,
    }));
  }

  private async clientUpdates(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.CLIENT_UPDATE)) {
      return [];
    }
    const rows = await this.prisma.clientUpdate.findMany({
      where: {
        organizationId: scope.organizationId,
        // Only published updates. A draft has not been shown to anyone and may still be wrong.
        status: 'PUBLISHED',
        publishedAt: this.window(scope),
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
      },
      select: { id: true, title: true, body: true, publishedAt: true },
      orderBy: { publishedAt: 'asc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.CLIENT_UPDATE,
      refId: row.id,
      label: row.title,
      text: row.body,
      occurredAt: row.publishedAt,
      // Already approved and shown to the client, so it is safe to build client text from.
      clientVisible: true,
    }));
  }

  private async milestones(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.MILESTONE) || !scope.projectId) {
      return [];
    }
    const rows = await this.prisma.milestone.findMany({
      where: {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        deletedAt: null,
        updatedAt: this.window(scope),
      },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        clientVisible: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.MILESTONE,
      refId: row.id,
      label: `${row.name} [${row.status}]`,
      text: null,
      occurredAt: row.updatedAt,
      // A milestone carries its own visibility flag, and its name is written by the team — an
      // internal one can say anything. Milestones are allow-listed for two client-facing types,
      // so hard-coding `true` here would put an internal name in a client prompt; `prepareSources`
      // drops the ones that are not client-visible.
      clientVisible: row.clientVisible,
    }));
  }

  private async codeActivity(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.CODE_ACTIVITY)) {
      return [];
    }
    const rows = await this.prisma.codeActivity.findMany({
      where: {
        organizationId: scope.organizationId,
        occurredAt: this.window(scope),
        ...(scope.projectId
          ? { repositoryLink: { projectId: scope.projectId, deletedAt: null } }
          : {}),
      },
      select: { id: true, kind: true, title: true, externalId: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
      take: TAKE,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.CODE_ACTIVITY,
      refId: null,
      label: `${row.kind} ${row.externalId}: ${row.title}`,
      text: null,
      occurredAt: row.occurredAt,
      // Never client-visible, whatever the kind.
      //
      // `code_activities` has no visibility column, so there is no record-level flag to honour —
      // and `title` is whatever a developer typed on a branch, a commit or a tag. Merging a pull
      // request is not a decision to show its title to a client. Since CODE_ACTIVITY is an
      // authorised source for RELEASE_NOTE_DRAFT, which is client-facing, deciding this by kind
      // put developer-written text into a client prompt. A release note is built from tasks the
      // team marked client-visible and from published updates; `prepareSources` drops these.
      clientVisible: false,
    }));
  }

  private async releaseNotes(scope: CollectionScope): Promise<RawSource[]> {
    if (!this.allowed(scope, AI_SOURCE_KIND.RELEASE_NOTE) || !scope.projectId) {
      return [];
    }
    const rows = await this.prisma.releaseNote.findMany({
      where: {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        deletedAt: null,
        // Published only: an unapproved release note is not a fact about the project yet.
        status: 'PUBLISHED',
        publishedAt: this.window(scope),
      },
      select: { id: true, version: true, clientSummary: true, publishedAt: true },
      orderBy: { publishedAt: 'asc' },
      take: 50,
    });

    return rows.map((row) => ({
      kind: AI_SOURCE_KIND.RELEASE_NOTE,
      refId: row.id,
      label: `Release ${row.version}`,
      // The client summary only. `internalNotes` on a release note is exactly the kind of field
      // this module exists to keep out of a client document.
      text: row.clientSummary,
      occurredAt: row.publishedAt,
      clientVisible: true,
    }));
  }
}
