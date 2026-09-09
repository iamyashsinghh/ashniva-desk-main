import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, type AuthenticatedUser, type PermissionKey } from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { UploadFileDto } from './dto/file.dto';
import type { FileParentFilter, FileRow } from './files.repository';

/** The parents a file may hang off, named by the DTO field that carries the id. */
const PARENT_KINDS = [
  'taskId',
  'ticketId',
  'projectId',
  'contractId',
  'milestoneId',
  'changeRequestId',
  'approvalId',
] as const;

export type FileParentKind = (typeof PARENT_KINDS)[number];

/**
 * The permission that already governs reading each kind of parent, so an attachment is never a
 * way round the gate on the thing it hangs off.
 *
 * Holding any one key of the list is enough. `milestoneId` uses `project:read` because that is
 * what `GET /milestones/:id` and the portal's milestone list ask for; `approvalId` mirrors the
 * approvals endpoints, whose client side is reached with `approval:decide`.
 */
const PARENT_READ_PERMISSIONS: Record<FileParentKind, readonly PermissionKey[]> = {
  taskId: [PERMISSIONS.TASK_READ],
  ticketId: [PERMISSIONS.TICKET_READ],
  projectId: [PERMISSIONS.PROJECT_READ],
  contractId: [PERMISSIONS.CONTRACT_READ],
  milestoneId: [PERMISSIONS.PROJECT_READ],
  changeRequestId: [PERMISSIONS.CHANGE_REQUEST_READ],
  approvalId: [PERMISSIONS.APPROVAL_MANAGE, PERMISSIONS.APPROVAL_DECIDE],
};

const PARENT_LABELS: Record<FileParentKind, string> = {
  taskId: 'task',
  ticketId: 'ticket',
  projectId: 'project',
  contractId: 'contract',
  milestoneId: 'milestone',
  changeRequestId: 'change request',
  approvalId: 'approval request',
};

/** Parents a client may never attach to, whoever they are. */
const INTERNAL_ONLY_UPLOAD_PARENTS: Partial<Record<FileParentKind, string>> = {
  taskId: 'tasks',
  milestoneId: 'milestones',
  approvalId: 'approval requests',
};

/**
 * Where a file may be attached, and who may reach one that is.
 *
 * Uploading: the parent must exist in the provider organization, and a client may only attach to
 * their own tickets, projects, contracts and change requests.
 *
 * Reading: `GET /files` and `GET /files/:id/download` used to run no parent check at all, so an
 * attachment was reachable by anyone holding a bearer token whether or not they could open the
 * thing it belongs to. Both now come through here.
 */
@Injectable()
export class FileParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertParent(
    actor: AuthenticatedUser,
    organizationId: string,
    dto: UploadFileDto,
    /** The uploader's task scope; attaching to a task they may not read is a 404, not a 403. */
    taskScope?: Prisma.TaskWhereInput,
  ): Promise<void> {
    const named = namedParents(dto);
    if (named.length > 1) {
      throw new BadRequestException('Attach a file to one parent at a time');
    }
    const kind = named[0];
    if (!kind) {
      return;
    }
    const internal = isInternalUser(actor);
    const internalOnly = INTERNAL_ONLY_UPLOAD_PARENTS[kind];
    if (internalOnly && !internal) {
      throw new ForbiddenException(`Clients cannot attach files to ${internalOnly}`);
    }
    await this.requireParent(actor, organizationId, kind, dto[kind] as string, taskScope);
  }

  /**
   * The parent a listing is asking about: exactly one is named, and for internal staff it must
   * exist in their tenant and they must hold the permission reading it already needs.
   *
   * A client is left to the ownership allow-list instead, because that allow-list is narrower
   * than any permission test and is what has always decided a client's view of a file.
   */
  async assertReadableParent(
    actor: AuthenticatedUser,
    organizationId: string,
    query: FileParentFilter,
  ): Promise<void> {
    const named = namedParents(query);
    if (named.length === 0) {
      throw new BadRequestException(
        'Name the task, ticket, project, contract, milestone, change request or approval whose attachments you want',
      );
    }
    if (named.length > 1) {
      throw new BadRequestException('Ask about one parent at a time');
    }
    const kind = named[0] as FileParentKind;
    if (!isInternalUser(actor)) {
      // A client is judged row by row instead, by the ownership allow-list in `FilesService`:
      // their own company's work, client-visible only. That is strictly narrower than any
      // permission test, and it is what has always decided a client's view of a file.
      return;
    }
    this.assertHolds(actor, PARENT_READ_PERMISSIONS[kind], PARENT_LABELS[kind]);
    await this.requireParent(actor, organizationId, kind, query[kind] as string);
  }

  /**
   * The same permission check for a single stored row, whose parent is whichever link it carries.
   *
   * An invoice PDF is the one file with no parent column — the link runs the other way, from
   * `Invoice.pdfFileId` — so an internal caller is judged on `invoice:read` instead. A row with
   * no link at all (the branding logo) has no parent to gate on.
   *
   * Clients again fall to the ownership allow-list: a client admin holds no `invoice:read` and
   * never will — it is not a client-safe key — yet downloading their own issued invoice is the
   * whole point of the portal's billing screen.
   */
  assertReadableFile(actor: AuthenticatedUser, row: FileRow): void {
    if (!isInternalUser(actor)) {
      return;
    }
    const kind = fileParentKind(row);
    if (kind) {
      this.assertHolds(actor, PARENT_READ_PERMISSIONS[kind], PARENT_LABELS[kind]);
      return;
    }
    if (row.invoicePdfs.length > 0 || row.invoiceHistoryPdfs.length > 0) {
      this.assertHolds(actor, [PERMISSIONS.INVOICE_READ], 'invoice');
    }
  }

  private async requireParent(
    actor: AuthenticatedUser,
    organizationId: string,
    kind: FileParentKind,
    id: string,
    // Only the upload path passes one: a listing's task scope is applied to the rows themselves,
    // in `FilesService`, which is where the same scope reaches every other read of a file.
    taskScope?: Prisma.TaskWhereInput,
  ): Promise<void> {
    const base = { organizationId, deletedAt: null };
    // A client may only name a parent of their own; the columns that carry that differ per table,
    // and the ones without one (tasks, milestones, approvals) are internal-only above.
    const clientScope = isInternalUser(actor) ? {} : { clientOrganizationId: actor.organizationId };
    const found = await this.findParent(kind, id, base, clientScope, taskScope);
    if (!found) {
      throw new NotFoundException(`${capitalize(PARENT_LABELS[kind])} not found`);
    }
  }

  private findParent(
    kind: FileParentKind,
    id: string,
    base: { organizationId: string; deletedAt: null },
    clientScope: { clientOrganizationId?: string },
    taskScope?: Prisma.TaskWhereInput,
  ): Promise<{ id: string } | null> {
    switch (kind) {
      case 'taskId':
        return this.prisma.task.findFirst({
          where: { id, ...base, ...(taskScope ? { AND: taskScope } : {}) },
          select: { id: true },
        });
      case 'ticketId':
        return this.prisma.ticket.findFirst({
          where: { id, ...base, ...clientScope },
          select: { id: true },
        });
      case 'projectId':
        return this.prisma.project.findFirst({
          where: { id, ...base, ...clientScope },
          select: { id: true },
        });
      case 'contractId':
        return this.prisma.contract.findFirst({
          where: { id, ...base, ...clientScope },
          select: { id: true },
        });
      case 'milestoneId':
        return this.prisma.milestone.findFirst({ where: { id, ...base }, select: { id: true } });
      case 'changeRequestId':
        return this.prisma.changeRequest.findFirst({
          where: { id, ...base, ...clientScope },
          select: { id: true },
        });
      case 'approvalId':
        return this.prisma.approvalRequest.findFirst({
          where: { id, ...base },
          select: { id: true },
        });
    }
  }

  private assertHolds(
    actor: AuthenticatedUser,
    permissions: readonly PermissionKey[],
    what: string,
  ): void {
    if (permissions.some((permission) => actor.permissions.includes(permission))) {
      return;
    }
    throw new ForbiddenException(`You do not have permission to read this ${what}`);
  }
}

function namedParents(source: FileParentFilter): FileParentKind[] {
  return PARENT_KINDS.filter((kind) => source[kind]);
}

/** Which parent link a stored row carries, if any. */
export function fileParentKind(row: FileRow): FileParentKind | undefined {
  if (row.task) return 'taskId';
  if (row.ticket) return 'ticketId';
  if (row.project) return 'projectId';
  if (row.contract) return 'contractId';
  if (row.milestone) return 'milestoneId';
  if (row.changeRequest) return 'changeRequestId';
  if (row.approval) return 'approvalId';
  return undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
