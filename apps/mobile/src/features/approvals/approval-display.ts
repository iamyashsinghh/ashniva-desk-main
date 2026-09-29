import {
  APPROVAL_ACTION,
  APPROVAL_LIST_VIEW,
  APPROVAL_STATUS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_SUBJECT_TYPE,
  APPROVAL_SUBJECT_TYPE_LABELS,
  type ApprovalAction,
  type ApprovalActionAvailability,
  type ApprovalListView,
  type ApprovalStatus,
  type ApprovalSubjectRef,
  type ApprovalSubjectType,
  type ApprovalSummary,
  type PortalApprovalSummary,
} from '@ashniva/types';
import { APPROVAL_STATUS_TONES } from '@ashniva/ui/status-tone';

import type { IconName, IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';
import type { SelectOption } from '../../shared/components/SelectSheet';
import type { TabOption } from '../../shared/components/TabBar';
import { formatDateTime, formatSince } from '../../shared/format/format';

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

const STATUS_ICONS: Record<ApprovalStatus, { icon: IconName; tone: IconTone }> = {
  DRAFT: { icon: 'document-text-outline', tone: 'neutral' },
  INTERNAL_REVIEW: { icon: 'eye-outline', tone: 'info' },
  PUBLISHED: { icon: 'hourglass-outline', tone: 'warning' },
  CLIENT_APPROVED: { icon: 'checkmark-circle-outline', tone: 'success' },
  CHANGES_REQUESTED: { icon: 'create-outline', tone: 'orange' },
  REJECTED: { icon: 'close-circle-outline', tone: 'danger' },
  WITHDRAWN: { icon: 'remove-circle-outline', tone: 'neutral' },
};

/** The leading mark for a request in a given state: a picture of where it has got to. */
export function approvalStatusIcon(status: ApprovalStatus): { icon: IconName; tone: IconTone } {
  return STATUS_ICONS[status] ?? { icon: 'shield-checkmark-outline', tone: 'primary' };
}

/**
 * What a write to a request makes stale: both sides' lists and details, and the home dashboard,
 * whose "approvals waiting" count is the first thing a manager or a client administrator sees.
 */
export const APPROVAL_INVALIDATES: readonly (readonly string[])[] = [
  ['approvals'],
  ['portal'],
  ['dashboard'],
];

/** "Milestone / deliverable · Payment 2", or just the label when the type adds nothing. */
export function subjectLine(subject: ApprovalSubjectRef): string {
  const type = APPROVAL_SUBJECT_TYPE_LABELS[subject.type] ?? subject.type;
  return subject.label ? `${type} · ${subject.label}` : type;
}

/** The five views the API offers, in the web app's order and with its wording. */
export const APPROVAL_VIEWS: readonly TabOption<ApprovalListView>[] = [
  { value: APPROVAL_LIST_VIEW.INBOX, label: 'Needs us', icon: 'person-circle-outline' },
  { value: APPROVAL_LIST_VIEW.MINE, label: 'Requested by me', icon: 'create-outline' },
  { value: APPROVAL_LIST_VIEW.WAITING_CLIENT, label: 'With client', icon: 'business-outline' },
  { value: APPROVAL_LIST_VIEW.DECIDED, label: 'Decided', icon: 'checkmark-done-outline' },
  { value: APPROVAL_LIST_VIEW.ALL, label: 'All', icon: 'albums-outline' },
];

export const SUBJECT_TYPE_OPTIONS: readonly SelectOption<ApprovalSubjectType>[] = Object.values(
  APPROVAL_SUBJECT_TYPE,
).map((type) => ({ value: type, label: APPROVAL_SUBJECT_TYPE_LABELS[type] }));

export const STATUS_OPTIONS: readonly SelectOption<ApprovalStatus>[] = Object.values(
  APPROVAL_STATUS,
).map((status) => ({
  value: status,
  label: APPROVAL_STATUS_LABELS[status],
  icon: STATUS_ICONS[status].icon,
  iconTone: STATUS_ICONS[status].tone,
}));

/** What last happened to a request, for its row: the decision if there was one. */
export function lastChangeLine(
  row: Pick<ApprovalSummary, 'decidedAt' | 'decidedBy' | 'updatedAt'>,
) {
  if (row.decidedAt) {
    return `Decided${row.decidedBy ? ` by ${row.decidedBy.name}` : ''} · ${formatSince(row.decidedAt) ?? ''}`;
  }
  return `Updated ${formatSince(row.updatedAt) ?? ''}`;
}

/** "Priya Rao · 3 Sep, 14:05", or a dash when nobody has done it yet. */
export function byLine(person: { name: string } | null, at: string | null): string {
  if (!person) {
    return '—';
  }
  const when = formatDateTime(at);
  return when ? `${person.name} · ${when}` : person.name;
}

/**
 * The client's list, in the two halves the web portal shows: what is waiting for them, and
 * everything already answered. Published is the one state only the client can move.
 */
export function splitPortalApprovals(approvals: readonly PortalApprovalSummary[]): {
  waiting: PortalApprovalSummary[];
  decided: PortalApprovalSummary[];
} {
  return {
    waiting: approvals.filter((entry) => entry.status === APPROVAL_STATUS.PUBLISHED),
    decided: approvals.filter((entry) => entry.status !== APPROVAL_STATUS.PUBLISHED),
  };
}

/**
 * The provider-side actions this app draws, and their words.
 *
 * The client's own three answers (approve, request changes, reject) are not here: they belong to
 * the portal screen, which asks for the comment the API requires with two of them. Edit and
 * withdraw open a sheet first — one for the wording, one for an optional reason.
 */
const PHONE_ACTIONS: ReadonlyArray<{
  action: ApprovalAction;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  {
    action: APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW,
    label: 'Send for internal review',
    hint: 'Passes the request to a colleague to check before the client sees it',
    icon: 'eye-outline',
  },
  {
    action: APPROVAL_ACTION.PUBLISH,
    label: 'Publish to the client',
    hint: 'The client can decide on it from this point',
    icon: 'paper-plane-outline',
  },
  {
    action: APPROVAL_ACTION.RETURN_TO_DRAFT,
    label: 'Return to draft',
    hint: 'Takes it back for changes',
    icon: 'arrow-undo-outline',
  },
  {
    action: APPROVAL_ACTION.EDIT,
    label: 'Edit the wording',
    hint: 'Changes the title, the summary the client reads, the date or the internal notes',
    icon: 'create-outline',
  },
  {
    action: APPROVAL_ACTION.WITHDRAW,
    label: 'Withdraw',
    hint: 'Takes the request off the table',
    icon: 'remove-circle-outline',
  },
];

export interface ApprovalButton {
  action: ApprovalAction;
  label: string;
  hint: string;
  icon: IconName;
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

/** Transitions that go straight to the API, as opposed to the two that open a sheet first. */
export type DirectTransition = Extract<
  ApprovalAction,
  'send-to-internal-review' | 'publish' | 'return-to-draft'
>;

export function isDirectTransition(action: ApprovalAction): action is DirectTransition {
  return (
    action === APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW ||
    action === APPROVAL_ACTION.PUBLISH ||
    action === APPROVAL_ACTION.RETURN_TO_DRAFT
  );
}
