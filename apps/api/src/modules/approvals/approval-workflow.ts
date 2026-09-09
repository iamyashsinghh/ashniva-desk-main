import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_STATUS_LABELS,
  PERMISSIONS,
  canTransitionApproval,
  isClientRole,
  type ApprovalAction,
  type ApprovalActionAvailability,
  type ApprovalStatus,
  type AuthenticatedUser,
} from '@ashniva/types';

export interface WorkflowApproval {
  status: ApprovalStatus;
  requestedById: string;
  publishedById: string | null;
  clientOrganizationId: string;
}

type Actor = Pick<
  AuthenticatedUser,
  'userId' | 'organizationId' | 'roleKey' | 'permissions' | 'isServiceProvider'
>;

const S = APPROVAL_STATUS;
const A = APPROVAL_ACTION;

/** Where each action leads; EDIT has no target. */
export const APPROVAL_ACTION_TARGET: Partial<Record<ApprovalAction, ApprovalStatus>> = {
  [A.SEND_TO_INTERNAL_REVIEW]: S.INTERNAL_REVIEW,
  [A.RETURN_TO_DRAFT]: S.DRAFT,
  [A.PUBLISH]: S.PUBLISHED,
  [A.APPROVE]: S.CLIENT_APPROVED,
  [A.REQUEST_CHANGES]: S.CHANGES_REQUESTED,
  [A.REJECT]: S.REJECTED,
  [A.WITHDRAW]: S.WITHDRAWN,
};

function isInternal(actor: Actor): boolean {
  return actor.isServiceProvider && !isClientRole(actor.roleKey);
}

function has(actor: Actor, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]): boolean {
  return actor.permissions.includes(permission);
}

function manages(approval: WorkflowApproval, actor: Actor): boolean {
  return (
    isInternal(actor) &&
    (has(actor, PERMISSIONS.APPROVAL_MANAGE) || approval.requestedById === actor.userId)
  );
}

/**
 * Two sides, never the same person: the provider prepares and publishes, the client decides.
 * A client user who also happens to be the requester or publisher (dual memberships) cannot
 * decide, so one person can never approve their own request.
 */
export function explainApprovalAction(
  approval: WorkflowApproval,
  actor: Actor,
  action: ApprovalAction,
): ApprovalActionAvailability {
  const disabled = (reason: string): ApprovalActionAvailability => ({
    action,
    enabled: false,
    reason,
  });
  const label = APPROVAL_STATUS_LABELS[approval.status].toLowerCase();
  const target = APPROVAL_ACTION_TARGET[action];
  if (target && !canTransitionApproval(approval.status, target)) {
    return disabled(`Not available while the request is ${label}`);
  }
  switch (action) {
    case A.SEND_TO_INTERNAL_REVIEW:
    case A.RETURN_TO_DRAFT:
    case A.WITHDRAW:
      if (!manages(approval, actor)) {
        return disabled('Only the requester or an approval manager can do this');
      }
      return { action, enabled: true };
    case A.PUBLISH:
      if (!isInternal(actor) || !has(actor, PERMISSIONS.APPROVAL_MANAGE)) {
        return disabled('Only an approval manager can publish to the client');
      }
      return { action, enabled: true };
    case A.APPROVE:
    case A.REQUEST_CHANGES:
    case A.REJECT:
      if (isInternal(actor) || actor.organizationId !== approval.clientOrganizationId) {
        return disabled('Only the client organization decides');
      }
      if (!has(actor, PERMISSIONS.APPROVAL_DECIDE)) {
        return disabled('Your role cannot decide on approvals');
      }
      if (actor.userId === approval.requestedById || actor.userId === approval.publishedById) {
        return disabled('The person who requested or published cannot also decide');
      }
      return { action, enabled: true };
    case A.EDIT:
      if (
        approval.status !== S.DRAFT &&
        approval.status !== S.INTERNAL_REVIEW &&
        approval.status !== S.CHANGES_REQUESTED
      ) {
        return disabled(`Cannot edit a request that is ${label}`);
      }
      if (!manages(approval, actor)) {
        return disabled('Only the requester or an approval manager can edit');
      }
      return { action, enabled: true };
    default:
      return disabled('Unknown action');
  }
}

export function listApprovalActions(
  approval: WorkflowApproval,
  actor: Actor,
): ApprovalActionAvailability[] {
  return Object.values(A).map((action) => explainApprovalAction(approval, actor, action));
}

export function assertApprovalAction(
  approval: WorkflowApproval,
  actor: Actor,
  action: ApprovalAction,
): void {
  const availability = explainApprovalAction(approval, actor, action);
  if (availability.enabled) {
    return;
  }
  const target = APPROVAL_ACTION_TARGET[action];
  if (target && !canTransitionApproval(approval.status, target)) {
    throw new ConflictException(availability.reason);
  }
  throw new ForbiddenException(availability.reason);
}
