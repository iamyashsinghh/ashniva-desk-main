import {
  CHANGE_REQUEST_STATUS,
  PERMISSIONS,
  type PermissionKey,
  type PortalChangeRequestDetail,
} from '@ashniva/types';

export type PortalChangeRequestAction =
  'submit' | 'edit' | 'approve' | 'request-changes' | 'reject' | 'cancel';

const S = CHANGE_REQUEST_STATUS;

/**
 * What a client may do with one change request, in the order the buttons are drawn.
 *
 * The decisions come from the API (`canApprove`, `canRequestChanges`), which knows whether the
 * request is in client review and whether this person's organization decides it. The requester's
 * own steps follow the workflow in `change-request-workflow.ts`: only the person who raised it,
 * holding `change-request:raise`, edits and submits a draft (or one sent back for changes) and
 * cancels it before review. The portal DTO carries no action list, so this mirrors those rules
 * rather than offering a button that answers 403 — the API still decides every call.
 */
export function portalChangeRequestActions(
  cr: Pick<
    PortalChangeRequestDetail,
    'status' | 'requestedBy' | 'canApprove' | 'canRequestChanges'
  >,
  userId: string | null,
  can: (permission: PermissionKey) => boolean,
): PortalChangeRequestAction[] {
  const requester =
    userId !== null && cr.requestedBy.id === userId && can(PERMISSIONS.CHANGE_REQUEST_RAISE);
  const decides = can(PERMISSIONS.APPROVAL_DECIDE);
  const editable = cr.status === S.DRAFT || cr.status === S.CHANGES_REQUESTED;
  const actions: PortalChangeRequestAction[] = [];

  if (requester && editable) {
    actions.push('submit', 'edit');
  }
  if (decides && cr.canApprove) {
    actions.push('approve');
  }
  if (decides && cr.canRequestChanges) {
    actions.push('request-changes');
  }
  if (decides && cr.canApprove) {
    actions.push('reject');
  }
  if (requester && (cr.status === S.DRAFT || cr.status === S.SUBMITTED)) {
    actions.push('cancel');
  }
  return actions;
}

/** Statuses after which nothing more happens to the request. */
export function isClosedChangeRequest(status: PortalChangeRequestDetail['status']): boolean {
  return status === S.COMPLETED || status === S.CANCELLED || status === S.REJECTED;
}
