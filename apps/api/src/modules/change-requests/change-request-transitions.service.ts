import { ConflictException, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_ACTION,
  APPROVAL_SUBJECT_TYPE,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS,
  NOTIFICATION_TYPE,
  PERMISSIONS,
  type ApprovalAction,
  type AuthenticatedUser,
  type ChangeRequestAction,
  type ChangeRequestDetail,
  type ChangeRequestStatus,
  type PortalChangeRequestDetail,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import {
  ApprovalTransitionsService,
  type ClientDecision,
} from '../approvals/approval-transitions.service';
import { ApprovalsRepository } from '../approvals/approvals.repository';
import { ApprovalsService } from '../approvals/approvals.service';
import { CHANGE_REQUEST_ACTION_TARGET, assertChangeRequestAction } from './change-request-workflow';
import { changeRequestNumber } from './change-requests.mapper';
import {
  ChangeRequestsRepository,
  type ChangeRequestDetailRow,
} from './change-requests.repository';
import { ChangeRequestsService } from './change-requests.service';

const CLIENT_DECISION_STATUS: Record<ClientDecision, ChangeRequestStatus> = {
  CLIENT_APPROVED: CHANGE_REQUEST_STATUS.APPROVED,
  CHANGES_REQUESTED: CHANGE_REQUEST_STATUS.CHANGES_REQUESTED,
  REJECTED: CHANGE_REQUEST_STATUS.REJECTED,
};

const PORTAL_DECISION: Record<string, ApprovalAction> = {
  [CHANGE_REQUEST_ACTION.APPROVE]: APPROVAL_ACTION.APPROVE,
  [CHANGE_REQUEST_ACTION.REQUEST_CHANGES]: APPROVAL_ACTION.REQUEST_CHANGES,
  [CHANGE_REQUEST_ACTION.REJECT]: APPROVAL_ACTION.REJECT,
};

/**
 * Status moves of a change request. Sending to the client publishes an approval request; the
 * client's decision on that request (from the approvals inbox or the CR page) moves the CR.
 */
@Injectable()
export class ChangeRequestTransitionsService implements OnModuleInit {
  constructor(
    private readonly changeRequests: ChangeRequestsRepository,
    private readonly service: ChangeRequestsService,
    private readonly approvals: ApprovalsService,
    private readonly approvalsRepository: ApprovalsRepository,
    private readonly approvalTransitions: ApprovalTransitionsService,
    private readonly auditLog: AuditLogService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  onModuleInit(): void {
    this.approvalTransitions.onDecided(
      APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST,
      (approval, decision, actor) =>
        this.applyClientDecision(approval.subjectId, decision, actor, approval.decisionComment),
    );
  }

  submit(actor: AuthenticatedUser, id: string, note?: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.SUBMIT, note ?? null, {
      submittedAt: new Date(),
    });
  }

  startInternalReview(actor: AuthenticatedUser, id: string, note?: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.START_INTERNAL_REVIEW, note ?? null);
  }

  /** Internal review → Client review, publishing an approval request the client can decide on. */
  async sendToClient(
    actor: AuthenticatedUser,
    id: string,
    note?: string,
  ): Promise<ChangeRequestDetail> {
    const cr = await this.service.require(actor, id);
    assertChangeRequestAction(cr, actor, CHANGE_REQUEST_ACTION.SEND_TO_CLIENT);
    const number = changeRequestNumber(cr);
    const approval = await this.approvals.create(actor, {
      title: `${number} ${cr.title}`,
      summary: note?.trim() || cr.description,
      subjectType: APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST,
      subjectId: cr.id,
    });
    await this.approvalTransitions.sendToInternalReview(
      actor,
      approval.id,
      'Change request sent to client',
    );
    await this.approvalTransitions.publish(actor, approval.id);
    return this.move(actor, id, CHANGE_REQUEST_ACTION.SEND_TO_CLIENT, note ?? null);
  }

  /** Internal side: send back or reject during internal review. */
  requestChanges(actor: AuthenticatedUser, id: string, note: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.REQUEST_CHANGES, note, {
      decisionNote: note,
    });
  }

  reject(actor: AuthenticatedUser, id: string, note: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.REJECT, note, { decisionNote: note });
  }

  schedule(actor: AuthenticatedUser, id: string, scheduledFor: string, note?: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.SCHEDULE, note ?? null, {
      scheduledFor: new Date(scheduledFor),
    });
  }

  complete(actor: AuthenticatedUser, id: string, note?: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.COMPLETE, note ?? null, {
      completedAt: new Date(),
    });
  }

  reopenDraft(actor: AuthenticatedUser, id: string, note?: string) {
    return this.move(actor, id, CHANGE_REQUEST_ACTION.REOPEN_DRAFT, note ?? null, {
      decisionNote: null,
    });
  }

  async cancel(actor: AuthenticatedUser, id: string, note: string) {
    const row = await this.move(actor, id, CHANGE_REQUEST_ACTION.CANCEL, note);
    await this.approvalTransitions.withdrawForSubject(
      actor,
      APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST,
      id,
      'Change request cancelled',
    );
    return row;
  }

  /** Portal: the client decides on the CR page; the decision goes through the approval request. */
  async decideFromPortal(
    actor: AuthenticatedUser,
    id: string,
    action: ChangeRequestAction,
    note: string | null,
  ): Promise<PortalChangeRequestDetail> {
    const cr = await this.service.require(actor, id);
    assertChangeRequestAction(cr, actor, action);
    const open = await this.approvalsRepository.findOpenForSubject(
      APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST,
      id,
    );
    const approvalAction = PORTAL_DECISION[action];
    if (!open || !approvalAction) {
      throw new ConflictException('This request is not waiting for your decision');
    }
    await this.approvalTransitions.decide(actor, open.id, approvalAction, note);
    return this.service.portalGet(actor, id);
  }

  /** Approval handler: mirrors the client's decision onto the change request. */
  private async applyClientDecision(
    changeRequestId: string,
    decision: ClientDecision,
    actor: AuthenticatedUser,
    note: string | null,
  ): Promise<void> {
    const cr = await this.service.require(actor, changeRequestId);
    if (cr.status !== CHANGE_REQUEST_STATUS.CLIENT_REVIEW) {
      return;
    }
    const target = CLIENT_DECISION_STATUS[decision];
    const row = await this.changeRequests.transition(cr.id, cr.status, target, actor.userId, note, {
      decisionNote: note,
      ...(target === CHANGE_REQUEST_STATUS.APPROVED ? { approvedAt: new Date() } : {}),
    });
    await this.audit(row, cr.status, note);
    await this.notifyStatus(actor, row, note);
  }

  private async move(
    actor: AuthenticatedUser,
    id: string,
    action: ChangeRequestAction,
    note: string | null,
    data: Parameters<ChangeRequestsRepository['transition']>[5] = {},
  ): Promise<ChangeRequestDetail> {
    const cr = await this.service.require(actor, id);
    assertChangeRequestAction(cr, actor, action);
    const target = CHANGE_REQUEST_ACTION_TARGET[action];
    if (!target) {
      throw new ConflictException('Not a status change');
    }
    const row = await this.changeRequests.transition(
      id,
      cr.status,
      target,
      actor.userId,
      note?.trim() || null,
      data,
    );
    await this.audit(row, cr.status, note);
    await this.notifyStatus(actor, row, note);
    return this.service.detail(actor, row);
  }

  /**
   * Status notifications go to the other side: the requester when the provider moved the
   * request (portal link for client requesters), the change-request managers when the client did.
   */
  private async notifyStatus(
    actor: AuthenticatedUser,
    row: ChangeRequestDetailRow,
    note: string | null,
  ): Promise<void> {
    const label = CHANGE_REQUEST_STATUS_LABELS[row.status as ChangeRequestStatus].toLowerCase();
    const fromProvider = isInternalUser(actor);
    const clientRequester = await this.recipients.member(
      row.clientOrganizationId,
      row.requestedById,
    );
    const recipients = fromProvider
      ? [
          ...clientRequester,
          ...(await this.recipients.member(row.organizationId, row.requestedById)),
        ]
      : await this.recipients.withPermission(row.organizationId, PERMISSIONS.CHANGE_REQUEST_MANAGE);
    const portal = fromProvider && clientRequester.length > 0;
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CHANGE_REQUEST_STATUS,
      title: `${changeRequestNumber(row)} is now ${label}`,
      body: note ?? row.title,
      link: portal ? `/portal/change-requests/${row.id}` : `/change-requests/${row.id}`,
      entityType: 'change_request',
      entityId: row.id,
      dedupeKey: `cr-status:${row.id}:${row.status}:${row.updatedAt.getTime()}`,
      recipients,
      excludeUserId: actor.userId,
    });
  }

  private audit(row: ChangeRequestDetailRow, from: string, note: string | null) {
    return this.auditLog.record({
      action: AUDIT_ACTION.CHANGE_REQUEST_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.CHANGE_REQUEST,
      entityId: row.id,
      organizationId: row.organizationId,
      before: { status: from },
      after: { number: changeRequestNumber(row), status: row.status, note },
    });
  }
}
