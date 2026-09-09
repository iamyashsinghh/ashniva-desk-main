import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type UatCommentRow,
  type UatRequestDetail,
  type UatRequestSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateUatRequestDto, ListUatRequestsQueryDto, UatCommentDto } from './dto/uat.dto';
import { toUatCommentRow, toUatRequestDetail, toUatRequestSummary } from './uat.mapper';
import { UatRepository, type UatRequestDetailRow } from './uat.repository';

const DEFAULT_LIST_SIZE = 100;

/**
 * The provider's side of client UAT: raising a sign-off request, following it, and answering a
 * question the client asked. Deciding is the client's, and lives in `PortalUatService`.
 *
 * `requiresClientUat` on a release policy is a gate that nothing could satisfy until these
 * existed — a release could be held for a sign-off that had no way of being asked for.
 */
@Injectable()
export class UatService {
  constructor(
    private readonly uat: UatRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListUatRequestsQueryDto,
  ): Promise<UatRequestSummary[]> {
    this.assertInternal(actor);
    const rows = await this.uat.list({
      organizationId: actor.organizationId,
      clientOrganizationId: query.clientOrganizationId,
      status: query.status,
      releaseId: query.releaseId,
      limit: DEFAULT_LIST_SIZE,
    });
    return rows.map(toUatRequestSummary);
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<UatRequestDetail> {
    return toUatRequestDetail(await this.require(actor, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateUatRequestDto): Promise<UatRequestDetail> {
    this.assertInternal(actor);
    const clientOrganizationId = await this.clientOf(actor.organizationId, dto);

    const row = await this.uat.create({
      organizationId: actor.organizationId,
      clientOrganizationId,
      releaseId: dto.releaseId ?? null,
      taskId: dto.taskId ?? null,
      summaryPlain: dto.summaryPlain.trim(),
      previewUrl: dto.previewUrl ?? null,
      checklist: (dto.checklist ?? []).map((item) => item.trim()).filter(Boolean),
      createdById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.UAT_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.UAT_REQUEST,
      entityId: row.id,
      organizationId: actor.organizationId,
      // The summary itself is not copied in: an audit entry records that a client was asked, not
      // what they were shown, and the row already holds that.
      after: { clientOrganizationId, releaseId: row.releaseId, taskId: row.taskId },
    });

    return toUatRequestDetail(row);
  }

  /**
   * The provider's reply on the thread, so a client who asked a question before approving gets an
   * answer in the place they asked it rather than by email.
   */
  async comment(actor: AuthenticatedUser, id: string, dto: UatCommentDto): Promise<UatCommentRow> {
    const row = await this.require(actor, id);
    const comment = await this.uat.addComment({
      organizationId: actor.organizationId,
      uatRequestId: row.id,
      authorId: actor.userId,
      body: dto.body.trim(),
      fromClient: false,
    });
    return toUatCommentRow(comment);
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<UatRequestDetailRow> {
    this.assertInternal(actor);
    const row = await this.uat.findDetail({ id, organizationId: actor.organizationId });
    if (!row) {
      throw new NotFoundException('UAT request not found');
    }
    return row;
  }

  /**
   * Which client is being asked, derived from the work rather than taken from the caller.
   *
   * The request body has no `clientOrganizationId` on purpose: a typo in one would put one
   * client's plain-language summary in another client's portal, and no amount of scoping further
   * down would undo that.
   */
  private async clientOf(organizationId: string, dto: CreateUatRequestDto): Promise<string> {
    const subjects = [dto.releaseId, dto.taskId].filter(Boolean);
    if (subjects.length !== 1) {
      throw new BadRequestException('Give exactly one of releaseId or taskId');
    }
    const project = dto.releaseId
      ? (
          await this.prisma.release.findFirst({
            where: { id: dto.releaseId, organizationId, deletedAt: null },
            select: { project: { select: { clientOrganizationId: true } } },
          })
        )?.project
      : (
          await this.prisma.task.findFirst({
            where: { id: dto.taskId, organizationId, deletedAt: null },
            select: { project: { select: { clientOrganizationId: true } } },
          })
        )?.project;

    if (!project) {
      throw new NotFoundException('The release or task to be signed off was not found');
    }
    if (!project.clientOrganizationId) {
      throw new BadRequestException(
        'That work is on an internal project, so no client can sign it off',
      );
    }
    return project.clientOrganizationId;
  }

  /** UAT is prepared by the provider; the client only ever answers one. */
  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('UAT requests are raised by the service provider');
    }
  }
}
