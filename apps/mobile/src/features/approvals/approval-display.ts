import {
  APPROVAL_ACTION,
  APPROVAL_LIST_VIEW,
  APPROVAL_STATUS_LABELS,
  APPROVAL_SUBJECT_TYPE_LABELS,
  type ApprovalAction,
  type ApprovalActionAvailability,
  type ApprovalListView,
  type ApprovalStatus,
  type ApprovalSubjectRef,
} from '@ashniva/types';
import { APPROVAL_STATUS_TONES } from '@ashniva/ui/status-tone';

import type { SegmentOption } from '../../shared/components/navigation-list';
import type { PillTone } from '../../shared/components/primitives';

/**
 * Approvals, phone-sized.
 *
 * Everything here is about *presentation*. Whether a person may see a request, and whether they
 * may move it, is the API's answer on every call — `ApprovalDetail.actions` for the provider and
 * `PortalApprovalDetail.canDecide` for the client. Nothing below is consulted as a permission.
 */

/** Status colour, from the same table the web app uses. See `task-display.ts` for the mapping. */
export function approvalTone(status: ApprovalStatus): PillTone {
  const tone = APPROVAL_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}

export function approvalStatusLabel(status: ApprovalStatus): string {
  return APPROVAL_STATUS_LABELS[status] ?? status;
}

/** "Milestone / deliverable · Payment 2", or just the label when the type adds nothing. */
export function subjectLine(subject: ApprovalSubjectRef): string {
  const type = APPROVAL_SUBJECT_TYPE_LABELS[subject.type] ?? subject.type;
  return subject.label ? `${type} · ${subject.label}` : type;
}

/**
 * The views a provider gets on the phone.
 *
 * The API offers five. `all` and `mine` are ways of searching a backlog, which is a desk
 * activity; what a phone answers is "is anything sitting with me", "is anything sitting with the
 * client", and "what came back".
 */
export const PHONE_APPROVAL_VIEWS: readonly SegmentOption<ApprovalListView>[] = [
  { value: APPROVAL_LIST_VIEW.INBOX, label: 'Mine' },
  { value: APPROVAL_LIST_VIEW.WAITING_CLIENT, label: 'With client' },
  { value: APPROVAL_LIST_VIEW.DECIDED, label: 'Decided' },
];

/**
 * The transitions this app draws, and their words.
 *
 * `edit` is deliberately not here. An approval request is a title and up to five thousand
 * characters of client-visible summary, and rewriting that on a phone — with the client's copy of
 * the old wording already in their inbox — is the kind of edit that is regretted. It stays on the
 * web, the same way a client update's wording does.
 *
 * The client's own three answers (approve, request changes, reject) are not here either: they
 * belong to the portal screen, which asks for the comment the API requires with two of them.
 */
const PHONE_ACTIONS: ReadonlyArray<{ action: ApprovalAction; label: string; hint: string }> = [
  {
    action: APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW,
    label: 'Send for internal review',
    hint: 'Passes the request to a colleague to check before the client sees it',
  },
  {
    action: APPROVAL_ACTION.PUBLISH,
    label: 'Publish to the client',
    hint: 'The client can decide on it from this point',
  },
  {
    action: APPROVAL_ACTION.RETURN_TO_DRAFT,
    label: 'Return to draft',
    hint: 'Takes it back for changes',
  },
  {
    action: APPROVAL_ACTION.WITHDRAW,
    label: 'Withdraw',
    hint: 'Takes the request off the table',
  },
];

export interface ApprovalButton {
  action: ApprovalAction;
  label: string;
  hint: string;
  enabled: boolean;
  /** The API's own sentence for why not, when it gave one. */
  reason: string | null;
}

/**
 * The buttons to draw, in a fixed order, from what the API offered this caller.
 *
 * A refused action is kept and drawn disabled with its reason rather than hidden, for the reason
 * `task-display.ts` sets out: a control that vanished and a control that is greyed look the same
 * to somebody who does not know it was ever there, and only one of them explains itself. Anything
 * the API did not mention at all is not drawn — it was never on offer.
 */
export function approvalButtons(actions: readonly ApprovalActionAvailability[]): ApprovalButton[] {
  const offered: ApprovalButton[] = [];
  for (const entry of PHONE_ACTIONS) {
    const availability = actions.find((candidate) => candidate.action === entry.action);
    if (!availability) {
      continue;
    }
    offered.push({
      ...entry,
      enabled: availability.enabled,
      reason: availability.enabled ? null : (availability.reason ?? null),
    });
  }
  return offered;
}
