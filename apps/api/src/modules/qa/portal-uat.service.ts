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
  NOTIFICATION_TYPE,
  UAT_DECISION,
  type AuthenticatedUser,
  type UatCommentRow,
  type UatDecision,
  type UatRequestDetail,
  type UatRequestSummary,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { isClientUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import type { UatCommentDto, UatDecisionDto } from './dto/uat.dto';
import { toUatCommentRow, toUatRequestDetail, toUatRequestSummary } from './uat.mapper';
import { UatRepository, type UatRequestDetailRow } from './uat.repository';

const DEFAULT_LIST_SIZE = 100;

/**
 * The client's side of UAT: what they have been asked to sign off, their answer, and the
 * questions they ask on the way.
 *
 * Every read here goes through `require`, which pins `clientOrganizationId` to the caller's own
 * organization. A request belonging to another client is reported as "not found", never as
 * "forbidden", so an id cannot be probed for existence.
 */
@Injectable()
export class PortalUatService {
  constructor(
    private readonly uat: UatRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly auditLog: AuditLogService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PortalUatService.name);
  }

  async list(actor: AuthenticatedUser): Promise<UatRequestSummary[]> {
    this.assertClient(actor);
    const rows = await this.uat.list({
      organizationId: await this.providerId(),
      clientOrganizationId: actor.organizationId,
      limit: DEFAULT_LIST_SIZE,
    });
    return rows.map(toUatRequestSummary);
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<UatRequestDetail> {
    return toUatRequestDetail(await this.require(actor, id));
  }

  /**
   * The sign-off itself.
   *
   * Idempotent-safe: the status is re-checked inside the write, so a double submit — or two
   * people at the client answering at once — leaves the first answer standing and tells the
   * second that it has already been decided, rather than silently replacing it.
   */
  async decide(
    actor: AuthenticatedUser,
    id: string,
    dto: UatDecisionDto,
  ): Promise<UatRequestDetail> {
    const row = await this.require(actor, id);
    const note = dto.note?.trim() || null;
    if (dto.decision === UAT_DECISION.CHANGES_REQUESTED && !note) {
      throw new BadRequestException('Say what needs to change');
    }

    const claimed = await this.uat.claimDecision(row.id, {
      decision: dto.decision,
      decidedById: actor.userId,
      decidedAt: new Date(),
      note,
    });
    if (claimed === 0) {
      throw new ConflictException('This sign-off has already been decided');
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.UAT_DECIDED,
      entityType: AUDIT_ENTITY_TYPE.UAT_REQUEST,
      entityId: row.id,
      // The provider owns the record; the deciding user is the client's, and comes from the
      // tenant context the audit service fills in.
      organizationId: await this.providerId(),
      before: { status: row.status },
      after: { status: dto.decision, note },
    });

    await this.announce(row, dto.decision, note);
    return toUatRequestDetail(await this.require(actor, id));
  }

  /**
   * Tells the person who asked that they have an answer.
   *
   * The provider raised the request and then had no way of learning it had been answered short of
   * opening the release page and looking — which matters most on CHANGES_REQUESTED, where a
   * client is waiting for work nobody knows has landed. The recipient is whoever raised it, in the
   * provider's organization; the client's own people are not told about their own answer.
   *
   * Never allowed to fail the decision. The sign-off is recorded and audited by the time this
   * runs, and a notification that could not be written must not turn a client's answer into a 500.
   */
  private async announce(
    row: UatRequestDetailRow,
    decision: UatDecision,
    note: string | null,
  ): Promise<void> {
    try {
      const organizationId = await this.providerId();
      const recipients = await this.recipients.member(organizationId, row.createdById);
      if (recipients.length === 0) {
        return;
      }
      const approved = decision === UAT_DECISION.APPROVED;
      await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.UAT_DECIDED,
        title: approved
          ? `${row.clientOrganization.name} signed off ${this.subjectOf(row)}`
          : `${row.clientOrganization.name} asked for changes to ${this.subjectOf(row)}`,
        // The client's own words when there are any: "they want changes" without them is a
        // notification that only tells somebody to go and read the thing it is about.
        body: note ?? (approved ? 'They approved it as it is.' : 'They asked for changes.'),
        link: row.releaseId ? `/releases/${row.releaseId}` : `/tasks/${row.taskId ?? ''}`,
        entityType: 'uat_request',
        entityId: row.id,
        // One notification per decision, and a decision can only be made once.
        dedupeKey: `uat-decided:${row.id}`,
        recipients,
      });
    } catch (error) {
      this.logger.warn({ err: error, uatRequestId: row.id }, 'Could not notify a UAT decision');
    }
  }

  /** What the client answered about, in the words the person who asked would recognise. */
  private subjectOf(row: UatRequestDetailRow): string {
    return row.release?.version ?? 'the change they were shown';
  }

  async comment(actor: AuthenticatedUser, id: string, dto: UatCommentDto): Promise<UatCommentRow> {
    const row = await this.require(actor, id);
    const comment = await this.uat.addComment({
      // The thread belongs to the provider's tenant, like the request it hangs off.
      organizationId: await this.providerId(),
      uatRequestId: row.id,
      authorId: actor.userId,
      body: dto.body.trim(),
      fromClient: true,
    });
    return toUatCommentRow(comment);
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<UatRequestDetailRow> {
    this.assertClient(actor);
    const row = await this.uat.findDetail({
      id,
      organizationId: await this.providerId(),
      clientOrganizationId: actor.organizationId,
    });
    if (!row) {
      throw new NotFoundException('UAT request not found');
    }
    return row;
  }

  private async providerId(): Promise<string> {
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      throw new NotFoundException('Service provider organization is not configured');
    }
    return provider.id;
  }

  /**
   * Internal staff are kept out even when their role happens to hold `uat:decide` — a super admin
   * does. A sign-off the provider gave itself is not a sign-off.
   */
  private assertClient(actor: AuthenticatedUser): void {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('Only the client can answer their own UAT request');
    }
  }
}
