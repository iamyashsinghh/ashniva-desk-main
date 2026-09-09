import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ReleaseNoteItemKind,
  type ReleaseNoteStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import {
  ReleaseNoteGeneratorService,
  type GenerateOptions,
} from './release-note-generator.service';
import {
  checkReleaseNoteAction,
  isEditable,
  type ReleaseNoteAction,
} from './release-note-workflow';
import {
  ReleaseNotesRepository,
  type ReleaseNoteDetailRow,
  type ReleaseNoteListFilter,
  type ReleaseNoteSummaryRow,
} from './release-notes.repository';

/** Audit action per workflow step, so the trail names what happened rather than "updated". */
const ACTION_AUDIT: Record<ReleaseNoteAction, string> = {
  submit: AUDIT_ACTION.RELEASE_NOTE_SUBMITTED,
  approve: AUDIT_ACTION.RELEASE_NOTE_APPROVED,
  requestChanges: AUDIT_ACTION.RELEASE_NOTE_CHANGES_REQUESTED,
  publish: AUDIT_ACTION.RELEASE_NOTE_PUBLISHED,
  cancel: AUDIT_ACTION.RELEASE_NOTE_CANCELLED,
  returnToDraft: AUDIT_ACTION.RELEASE_NOTE_RETURNED_TO_DRAFT,
};

@Injectable()
export class ReleaseNotesService {
  constructor(
    private readonly repository: ReleaseNotesRepository,
    private readonly generator: ReleaseNoteGeneratorService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  list(
    actor: AuthenticatedUser,
    query: { projectId?: string; status?: ReleaseNoteStatus[]; limit?: number; cursor?: string },
  ): Promise<{ items: ReleaseNoteSummaryRow[]; nextCursor: string | null; total: number }> {
    const filter: ReleaseNoteListFilter = {
      organizationId: actor.organizationId,
      projectId: query.projectId,
      status: query.status,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    };
    return this.repository.list(filter);
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<ReleaseNoteDetailRow> {
    const row = await this.repository.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Release note not found');
    }
    return row;
  }

  // -------------------------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------------------------

  async create(
    actor: AuthenticatedUser,
    input: {
      projectId: string;
      version: string;
      releaseDate: string;
      clientSummary?: string;
      internalNotes?: string;
    },
  ): Promise<ReleaseNoteDetailRow> {
    const project = await this.projectFor(actor, input.projectId);

    const existing = await this.prisma.releaseNote.findFirst({
      where: { projectId: input.projectId, version: input.version },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Version ${input.version} already exists for this project`);
    }

    const row = await this.repository.create({
      organizationId: actor.organizationId,
      // Taken from the project, never from the request: a caller must not be able to address a
      // note at another client's organization by supplying its id.
      clientOrganizationId: project.clientOrganizationId,
      projectId: input.projectId,
      version: input.version,
      releaseDate: new Date(input.releaseDate),
      clientSummary: input.clientSummary ?? null,
      internalNotes: input.internalNotes ?? null,
      createdById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.RELEASE_NOTE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.RELEASE_NOTE,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { projectId: input.projectId, version: input.version },
    });

    return row;
  }

  async edit(
    actor: AuthenticatedUser,
    id: string,
    input: {
      version?: string;
      releaseDate?: string;
      clientSummary?: string;
      internalNotes?: string;
    },
  ): Promise<ReleaseNoteDetailRow> {
    const current = await this.detail(actor, id);
    this.assertEditable(current);

    if (input.version && input.version !== current.version) {
      const clash = await this.prisma.releaseNote.findFirst({
        where: { projectId: current.projectId, version: input.version, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`Version ${input.version} already exists for this project`);
      }
    }

    return this.repository.update(id, {
      ...(input.version ? { version: input.version } : {}),
      ...(input.releaseDate ? { releaseDate: new Date(input.releaseDate) } : {}),
      ...(input.clientSummary === undefined ? {} : { clientSummary: input.clientSummary }),
      ...(input.internalNotes === undefined ? {} : { internalNotes: input.internalNotes }),
    });
  }

  /** Fills the draft from completed client-visible work. See ReleaseNoteGeneratorService. */
  async generate(
    actor: AuthenticatedUser,
    id: string,
    options: GenerateOptions = {},
  ): Promise<ReleaseNoteDetailRow> {
    return this.generator.generate(await this.detail(actor, id), options);
  }

  async addItem(
    actor: AuthenticatedUser,
    id: string,
    input: {
      kind: ReleaseNoteItemKind;
      refId?: string;
      externalRef?: string;
      label: string;
      clientLabel?: string;
      clientVisible?: boolean;
    },
  ): Promise<ReleaseNoteDetailRow> {
    const current = await this.detail(actor, id);
    this.assertEditable(current);

    const added = await this.repository.addItems(id, [
      {
        kind: input.kind,
        source: 'MANUAL',
        refId: input.refId ?? null,
        externalRef: input.externalRef ?? null,
        label: input.label.trim(),
        clientLabel: input.clientLabel?.trim() ?? null,
        clientVisible: input.clientVisible ?? true,
        sortOrder: current.items.length * 10,
      },
    ]);
    if (added.count === 0) {
      throw new ConflictException('That item is already on this release note');
    }

    return this.detail(actor, id);
  }

  async removeItem(
    actor: AuthenticatedUser,
    id: string,
    itemId: string,
  ): Promise<ReleaseNoteDetailRow> {
    const current = await this.detail(actor, id);
    this.assertEditable(current);

    const removed = await this.repository.removeItem(id, itemId);
    if (removed.count === 0) {
      throw new NotFoundException('Item not found on this release note');
    }
    return this.detail(actor, id);
  }

  async reorderItems(
    actor: AuthenticatedUser,
    id: string,
    itemIds: string[],
  ): Promise<ReleaseNoteDetailRow> {
    const current = await this.detail(actor, id);
    this.assertEditable(current);

    const known = new Set(current.items.map((item) => item.id));
    if (itemIds.length !== known.size || itemIds.some((itemId) => !known.has(itemId))) {
      throw new BadRequestException(
        'The order must list every item on this release note exactly once',
      );
    }

    await this.repository.reorderItems(id, itemIds);
    return this.detail(actor, id);
  }

  // -------------------------------------------------------------------------------------------
  // Workflow
  // -------------------------------------------------------------------------------------------

  /**
   * One entry point for every status change.
   *
   * The permission guard on the route answers "may this person publish at all"; the check here
   * answers "may this note be published right now, by this person". Both have to pass, so
   * holding the publish permission cannot skip review by calling the endpoint directly.
   */
  async act(
    actor: AuthenticatedUser,
    id: string,
    action: ReleaseNoteAction,
    note?: string,
  ): Promise<ReleaseNoteDetailRow> {
    const current = await this.detail(actor, id);
    const from = current.status as ReleaseNoteStatus;
    const check = checkReleaseNoteAction(action, from, actor.permissions, note);

    if (!check.ok) {
      throw check.reason === 'permission'
        ? new ForbiddenException(check.message)
        : new ConflictException(check.message);
    }

    if (action === 'publish' && current.items.every((item) => !item.clientVisible)) {
      // Publishing an empty document tells the client nothing and looks like a fault.
      throw new ConflictException('A release note needs at least one client-visible item');
    }

    const now = new Date();
    const stamps: Record<string, Date | string | null> = {};
    if (action === 'submit') {
      stamps.submittedById = actor.userId;
      stamps.submittedAt = now;
    }
    if (action === 'approve') {
      stamps.approvedById = actor.userId;
      stamps.approvedAt = now;
    }
    if (action === 'publish') {
      stamps.publishedById = actor.userId;
      stamps.publishedAt = now;
    }

    const row = await this.repository.transition(
      id,
      from,
      check.to,
      actor.userId,
      note?.trim() || null,
      stamps,
    );

    await this.auditLog.record({
      action: ACTION_AUDIT[action],
      entityType: AUDIT_ENTITY_TYPE.RELEASE_NOTE,
      entityId: id,
      organizationId: actor.organizationId,
      before: { status: from },
      after: { status: check.to, version: row.version },
    });

    return row;
  }

  // -------------------------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------------------------

  private assertEditable(row: ReleaseNoteDetailRow): void {
    if (!isEditable(row.status as ReleaseNoteStatus)) {
      throw new ConflictException(`A release note that is ${row.status} cannot be edited`);
    }
  }

  private async projectFor(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<{ clientOrganizationId: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
      select: { clientOrganizationId: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (!project.clientOrganizationId) {
      // A release note is a document addressed to a client. An internal project has nobody to
      // address it to, and defaulting to the provider organization would publish it into the
      // wrong portal.
      throw new BadRequestException(
        'This project has no client organization, so it cannot have a release note',
      );
    }
    return { clientOrganizationId: project.clientOrganizationId };
  }
}
