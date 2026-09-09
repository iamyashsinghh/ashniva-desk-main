import { BadRequestException, Injectable } from '@nestjs/common';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_STATUS_LABELS,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  NOTIFICATION_TYPE,
  PERMISSIONS,
  type ApprovalAction,
  type ApprovalDetail,
  type ApprovalStatus,
  type ApprovalSubjectType,
  type AuthenticatedUser,
  type PortalApprovalDetail,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { APPROVAL_ACTION_TARGET, assertApprovalAction } from './approval-workflow';
import { ApprovalsRepository, type ApprovalDetailRow } from './approvals.repository';
import { ApprovalsService } from './approvals.service';

export type ClientDecision = 'CLIENT_APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

/** Called after a client decision; the owning module (e.g. change requests) reacts to it. */
export type ApprovalDecisionHandler = (
  approval: ApprovalDetailRow,
  decision: ClientDecision,
  actor: AuthenticatedUser,
) => Promise<void>;

const DECISIONS: Record<string, ClientDecision> = {
  [APPROVAL_ACTION.APPROVE]: APPROVAL_STATUS.CLIENT_APPROVED,
  [APPROVAL_ACTION.REQUEST_CHANGES]: APPROVAL_STATUS.CHANGES_REQUESTED,
  [APPROVAL_ACTION.REJECT]: APPROVAL_STATUS.REJECTED,
};

/**
 * Status moves of approval requests. The provider side prepares, reviews and publishes; the
 * client side decides. Every move is validated by approval-workflow.ts and audited.
 */
@Injectable()
export class ApprovalTransitionsService {
  private readonly handlers = new Map<ApprovalSubjectType, ApprovalDecisionHandler[]>();

  constructor(
    private readonly approvals: ApprovalsRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /** Modules owning a subject type register what happens after the client decides. */
  onDecided(subjectType: ApprovalSubjectType, handler: ApprovalDecisionHandler): void {
    this.handlers.set(subjectType, [...(this.handlers.get(subjectType) ?? []), handler]);
  }

  sendToInternalReview(actor: AuthenticatedUser, id: string, comment?: string) {
    return this.move(actor, id, APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW, comment ?? null);
  }

  returnToDraft(actor: AuthenticatedUser, id: string, comment?: string) {
    return this.move(actor, id, APPROVAL_ACTION.RETURN_TO_DRAFT, comment ?? null);
  }

  /** Publishing makes the request (and a file subject) visible to the client. */
  async publish(actor: AuthenticatedUser, id: string, comment?: string): Promise<ApprovalDetail> {
    const now = new Date();
    const row = await this.move(actor, id, APPROVAL_ACTION.PUBLISH, comment ?? null, {
      publishedById: actor.userId,
      publishedAt: now,
      internalReviewerId: actor.userId,
      internalReviewedAt: now,
      decidedById: null,
      decidedAt: null,
      decisionComment: null,
    });
    if (row.subject.type === 'FILE' || row.subject.type === 'CONTRACT_DOCUMENT') {
      await this.prisma.file.updateMany({
        where: { id: row.subject.id, organizationId: actor.organizationId },
        data: { visibility: 'CLIENT' },
      });
    }
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.APPROVAL_REQUESTED,
      title: `Approval requested: ${row.title}`,
      body: row.summary,
      link: `/portal/approvals/${row.id}`,
      entityType: 'approval',
      entityId: row.id,
      dedupeKey: `approval-requested:${row.id}:${now.getTime()}`,
      recipients: await this.recipients.withPermission(
        row.clientOrganization.id,
        PERMISSIONS.APPROVAL_DECIDE,
      ),
      excludeUserId: actor.userId,
    });
    return row;
  }

  withdraw(actor: AuthenticatedUser, id: string, comment?: string) {
    return this.move(actor, id, APPROVAL_ACTION.WITHDRAW, comment ?? null);
  }

  /** Client-side decision through the portal. */
  async decide(
    actor: AuthenticatedUser,
    id: string,
    action: ApprovalAction,
    comment: string | null,
  ): Promise<PortalApprovalDetail> {
    const decision = DECISIONS[action];
    if (!decision) {
      throw new BadRequestException('Not a decision');
    }
    if (decision !== APPROVAL_STATUS.CLIENT_APPROVED && !comment?.trim()) {
      throw new BadRequestException('Tell the provider what should change');
    }
    const before = await this.approvalsService.require(actor, id);
    assertApprovalAction(before, actor, action);
    const row = await this.approvals.transition(
      id,
      before.status as ApprovalStatus,
      decision,
      actor.userId,
      'CLIENT',
      comment?.trim() || null,
      {
        decidedById: actor.userId,
        decidedAt: new Date(),
        decisionComment: comment?.trim() || null,
      },
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.APPROVAL_DECIDED,
      entityType: AUDIT_ENTITY_TYPE.APPROVAL,
      entityId: id,
      organizationId: row.organizationId,
      before: { status: before.status },
      after: { status: row.status, subject: `${row.subjectType}:${row.subjectId}`, comment },
    });
    for (const handler of this.handlers.get(row.subjectType as ApprovalSubjectType) ?? []) {
      await handler(row, decision, actor);
    }
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.APPROVAL_DECIDED,
      title: `${APPROVAL_STATUS_LABELS[decision]}: ${row.title}`,
      body: comment?.trim() || null,
      link: `/approvals/${row.id}`,
      entityType: 'approval',
      entityId: row.id,
      dedupeKey: `approval-decided:${row.id}:${decision}:${row.updatedAt.getTime()}`,
      recipients: await this.recipients.members(row.organizationId, [
        row.requestedById,
        row.publishedById,
      ]),
      excludeUserId: actor.userId,
    });
    return this.approvalsService.portalGet(actor, id);
  }

  /** The subject went away (e.g. a change request was cancelled): withdraw its open request. */
  async withdrawForSubject(
    actor: AuthenticatedUser,
    subjectType: ApprovalSubjectType,
    subjectId: string,
    comment: string,
  ): Promise<void> {
    const open = await this.approvals.findOpenForSubject(subjectType, subjectId);
    if (!open) {
      return;
    }
    await this.approvals.transition(
      open.id,
      open.status as ApprovalStatus,
      APPROVAL_STATUS.WITHDRAWN,
      actor.userId,
      'INTERNAL',
      comment,
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.APPROVAL_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.APPROVAL,
      entityId: open.id,
      before: { status: open.status },
      after: { status: APPROVAL_STATUS.WITHDRAWN, comment },
    });
  }

  private async move(
    actor: AuthenticatedUser,
    id: string,
    action: ApprovalAction,
    comment: string | null,
    data: Parameters<ApprovalsRepository['transition']>[6] = {},
  ): Promise<ApprovalDetail> {
    const before = await this.approvalsService.require(actor, id);
    assertApprovalAction(before, actor, action);
    const target = APPROVAL_ACTION_TARGET[action];
    if (!target) {
      throw new BadRequestException('Not a status change');
    }
    const row = await this.approvals.transition(
      id,
      before.status as ApprovalStatus,
      target,
      actor.userId,
      'INTERNAL',
      comment?.trim() || null,
      data,
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.APPROVAL_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.APPROVAL,
      entityId: id,
      before: { status: before.status },
      after: { status: row.status, comment },
    });
    return this.approvalsService.detail(actor, row);
  }
}
