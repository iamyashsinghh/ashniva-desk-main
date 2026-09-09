import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS,
  PERMISSIONS,
  canTransitionChangeRequest,
  isClientRole,
  type AuthenticatedUser,
  type ChangeRequestAction,
  type ChangeRequestActionAvailability,
  type ChangeRequestStatus,
} from '@ashniva/types';

export interface WorkflowChangeRequest {
  status: ChangeRequestStatus;
  requestedById: string;
  clientOrganizationId: string;
}

type Actor = Pick<
  AuthenticatedUser,
  'userId' | 'organizationId' | 'roleKey' | 'permissions' | 'isServiceProvider'
>;

const S = CHANGE_REQUEST_STATUS;
const A = CHANGE_REQUEST_ACTION;

export const CHANGE_REQUEST_ACTION_TARGET: Partial<
  Record<ChangeRequestAction, ChangeRequestStatus>
> = {
  [A.SUBMIT]: S.SUBMITTED,
  [A.START_INTERNAL_REVIEW]: S.INTERNAL_REVIEW,
  [A.SEND_TO_CLIENT]: S.CLIENT_REVIEW,
  [A.APPROVE]: S.APPROVED,
  [A.REQUEST_CHANGES]: S.CHANGES_REQUESTED,
  [A.REJECT]: S.REJECTED,
  [A.SCHEDULE]: S.SCHEDULED,
  [A.COMPLETE]: S.COMPLETED,
  [A.CANCEL]: S.CANCELLED,
  [A.REOPEN_DRAFT]: S.DRAFT,
};

function isInternal(actor: Actor): boolean {
  return actor.isServiceProvider && !isClientRole(actor.roleKey);
}

function has(actor: Actor, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]): boolean {
  return actor.permissions.includes(permission);
}

function manages(actor: Actor): boolean {
  return isInternal(actor) && has(actor, PERMISSIONS.CHANGE_REQUEST_MANAGE);
}

function isRequester(cr: WorkflowChangeRequest, actor: Actor): boolean {
  return cr.requestedById === actor.userId;
}

function isClientSide(cr: WorkflowChangeRequest, actor: Actor): boolean {
  return !isInternal(actor) && actor.organizationId === cr.clientOrganizationId;
}

/**
 * Who may do what on a change request:
 *  - the requester (client or staff) writes, submits, cancels while unreviewed and reopens drafts;
 *  - change-request managers review, send to the client, schedule, complete, cancel, link tasks;
 *  - the client organization (approval:decide) approves, requests changes or rejects during
 *    client review — never the provider on the client's behalf.
 */
export function explainChangeRequestAction(
  cr: WorkflowChangeRequest,
  actor: Actor,
  action: ChangeRequestAction,
): ChangeRequestActionAvailability {
  const disabled = (reason: string): ChangeRequestActionAvailability => ({
    action,
    enabled: false,
    reason,
  });
  const label = CHANGE_REQUEST_STATUS_LABELS[cr.status].toLowerCase();
  const target = CHANGE_REQUEST_ACTION_TARGET[action];
  if (target && !canTransitionChangeRequest(cr.status, target)) {
    return disabled(`Not available while the request is ${label}`);
  }
  const clientDecides = cr.status === S.CLIENT_REVIEW;
  switch (action) {
    case A.SUBMIT:
    case A.REOPEN_DRAFT:
      if (!isRequester(cr, actor) && !manages(actor)) {
        return disabled('Only the requester or a change-request manager can do this');
      }
      return { action, enabled: true };
    case A.START_INTERNAL_REVIEW:
    case A.SEND_TO_CLIENT:
    case A.SCHEDULE:
    case A.COMPLETE:
    case A.GENERATE_TASKS:
      if (!manages(actor)) {
        return disabled('Only a change-request manager can do this');
      }
      if (action === A.GENERATE_TASKS && cr.status !== S.APPROVED && cr.status !== S.SCHEDULED) {
        return disabled('Tasks are generated once the request is approved');
      }
      return { action, enabled: true };
    case A.APPROVE:
      if (!clientDecides) {
        return disabled(`Not available while the request is ${label}`);
      }
      if (!isClientSide(cr, actor) || !has(actor, PERMISSIONS.APPROVAL_DECIDE)) {
        return disabled('Only the client organization approves a change request');
      }
      return { action, enabled: true };
    case A.REQUEST_CHANGES:
    case A.REJECT:
      if (clientDecides) {
        if (!isClientSide(cr, actor) || !has(actor, PERMISSIONS.APPROVAL_DECIDE)) {
          return disabled('Only the client organization decides during client review');
        }
        return { action, enabled: true };
      }
      if (!manages(actor)) {
        return disabled('Only a change-request manager can do this during internal review');
      }
      return { action, enabled: true };
    case A.CANCEL:
      if (manages(actor)) {
        return { action, enabled: true };
      }
      if (isRequester(cr, actor) && (cr.status === S.DRAFT || cr.status === S.SUBMITTED)) {
        return { action, enabled: true };
      }
      return disabled('Only the requester (before review) or a manager can cancel');
    case A.EDIT:
      if (manages(actor) && cr.status !== S.COMPLETED && cr.status !== S.CANCELLED) {
        return { action, enabled: true };
      }
      if (isRequester(cr, actor) && (cr.status === S.DRAFT || cr.status === S.CHANGES_REQUESTED)) {
        return { action, enabled: true };
      }
      return disabled('Only drafts (or requests sent back for changes) can be edited');
    default:
      return disabled('Unknown action');
  }
}

export function listChangeRequestActions(
  cr: WorkflowChangeRequest,
  actor: Actor,
): ChangeRequestActionAvailability[] {
  return Object.values(A).map((action) => explainChangeRequestAction(cr, actor, action));
}

export function assertChangeRequestAction(
  cr: WorkflowChangeRequest,
  actor: Actor,
  action: ChangeRequestAction,
): void {
  const availability = explainChangeRequestAction(cr, actor, action);
  if (availability.enabled) {
    return;
  }
  const target = CHANGE_REQUEST_ACTION_TARGET[action];
  if (target && !canTransitionChangeRequest(cr.status, target)) {
    throw new ConflictException(availability.reason);
  }
  throw new ForbiddenException(availability.reason);
}
