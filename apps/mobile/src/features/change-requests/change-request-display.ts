import { CHANGE_REQUEST_STATUS_TONES, type Tone } from '@ashniva/ui/status-tone';
import {
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS,
  type ChangeRequestAction,
  type ChangeRequestActionAvailability,
  type ChangeRequestStatus,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import type { ButtonVariant, PillTone } from '../../shared/components/primitives';
import type { TabOption } from '../../shared/components/TabBar';

/** Words, colours and the order of the buttons for change requests. */

function toPillTone(tone: Tone | undefined): PillTone {
  if (!tone) {
    return 'neutral';
  }
  return tone === 'review' ? 'info' : tone;
}

export function changeRequestTone(status: ChangeRequestStatus): PillTone {
  return toPillTone(CHANGE_REQUEST_STATUS_TONES[status]);
}

export function changeRequestStatusLabel(status: ChangeRequestStatus): string {
  return CHANGE_REQUEST_STATUS_LABELS[status] ?? status;
}

const S = CHANGE_REQUEST_STATUS;

export type ChangeRequestView = 'open' | 'needs-us' | 'waiting-client' | 'done' | 'all';

/** The web list's views: who the request is waiting on, rather than a raw status filter. */
export const CHANGE_REQUEST_VIEW_STATUSES: Record<ChangeRequestView, ChangeRequestStatus[] | null> =
  {
    open: [
      S.DRAFT,
      S.SUBMITTED,
      S.INTERNAL_REVIEW,
      S.CLIENT_REVIEW,
      S.CHANGES_REQUESTED,
      S.APPROVED,
      S.SCHEDULED,
    ],
    'needs-us': [S.SUBMITTED, S.INTERNAL_REVIEW, S.APPROVED, S.SCHEDULED],
    'waiting-client': [S.CLIENT_REVIEW, S.CHANGES_REQUESTED],
    done: [S.COMPLETED, S.REJECTED, S.CANCELLED],
    all: null,
  };

export const CHANGE_REQUEST_VIEWS: readonly TabOption<ChangeRequestView>[] = [
  { value: 'open', label: 'Open', icon: 'git-pull-request-outline' },
  { value: 'needs-us', label: 'Needs us', icon: 'hand-left-outline' },
  { value: 'waiting-client', label: 'Waiting for client', icon: 'hourglass-outline' },
  { value: 'done', label: 'Closed', icon: 'checkmark-done-outline' },
  { value: 'all', label: 'All', icon: 'albums-outline' },
];

export function isClosed(status: ChangeRequestStatus): boolean {
  return status === S.COMPLETED || status === S.REJECTED || status === S.CANCELLED;
}

/** A change's money impact with its currency; "—" when it has not been priced. */
export function formatCost(amount: string | null, currency: string): string {
  if (amount === null) {
    return '—';
  }
  const value = Number(amount);
  return Number.isFinite(value)
    ? `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${currency} ${amount}`;
}

const A = CHANGE_REQUEST_ACTION;

interface ActionSpec {
  action: ChangeRequestAction;
  label: string;
  icon: IconName;
  variant: ButtonVariant;
}

/** The web's order and wording. `approve` is the client's, so it has no button on this side. */
const SPECS: readonly ActionSpec[] = [
  { action: A.SUBMIT, label: 'Submit', icon: 'send-outline', variant: 'primary' },
  {
    action: A.START_INTERNAL_REVIEW,
    label: 'Start internal review',
    icon: 'eye-outline',
    variant: 'primary',
  },
  {
    action: A.SEND_TO_CLIENT,
    label: 'Send to client for approval',
    icon: 'paper-plane-outline',
    variant: 'primary',
  },
  {
    action: A.GENERATE_TASKS,
    label: 'Create tasks & milestone',
    icon: 'git-branch-outline',
    variant: 'primary',
  },
  { action: A.SCHEDULE, label: 'Schedule', icon: 'calendar-outline', variant: 'primary' },
  { action: A.COMPLETE, label: 'Mark completed', icon: 'checkmark-done', variant: 'primary' },
  { action: A.EDIT, label: 'Edit', icon: 'create-outline', variant: 'secondary' },
  {
    action: A.REQUEST_CHANGES,
    label: 'Request changes',
    icon: 'return-down-back-outline',
    variant: 'secondary',
  },
  {
    action: A.REOPEN_DRAFT,
    label: 'Back to draft',
    icon: 'arrow-undo-outline',
    variant: 'secondary',
  },
  { action: A.REJECT, label: 'Reject', icon: 'close-circle-outline', variant: 'danger' },
  { action: A.CANCEL, label: 'Cancel request', icon: 'ban-outline', variant: 'dangerGhost' },
];

export interface ActionButton extends ActionSpec {
  enabled: boolean;
  reason: string | null;
}

/** The buttons for the actions the API listed, in the web's order, keeping its reasons. */
export function actionButtons(
  availability: readonly ChangeRequestActionAvailability[],
): ActionButton[] {
  return SPECS.flatMap((spec) => {
    const entry = availability.find((candidate) => candidate.action === spec.action);
    return entry ? [{ ...spec, enabled: entry.enabled, reason: entry.reason ?? null }] : [];
  });
}

/** The steps that go straight to the API, with nothing to ask first. */
export type DirectStep = 'submit' | 'start-internal-review' | 'reopen-draft';

export function isDirectStep(action: ChangeRequestAction): action is DirectStep {
  return action === A.SUBMIT || action === A.START_INTERNAL_REVIEW || action === A.REOPEN_DRAFT;
}

/** The steps that ask for a note first, and whether they insist on one. */
export type NoteStep = 'send-to-client' | 'request-changes' | 'reject' | 'cancel' | 'complete';

export const NOTE_STEPS: Record<
  NoteStep,
  { title: string; label: string; required: boolean; confirm: string; danger: boolean }
> = {
  'send-to-client': {
    title: 'Send to the client for approval',
    label: 'Message to the client',
    required: false,
    confirm: 'Send',
    danger: false,
  },
  'request-changes': {
    title: 'Request changes',
    label: 'What needs to change?',
    required: true,
    confirm: 'Request changes',
    danger: false,
  },
  reject: {
    title: 'Reject this request',
    label: 'Why?',
    required: true,
    confirm: 'Reject',
    danger: true,
  },
  cancel: {
    title: 'Cancel this request',
    label: 'Why?',
    required: true,
    confirm: 'Cancel request',
    danger: true,
  },
  complete: {
    title: 'Mark as completed',
    label: 'Closing note',
    required: false,
    confirm: 'Mark completed',
    danger: false,
  },
};

export function isNoteStep(action: string): action is NoteStep {
  return Object.prototype.hasOwnProperty.call(NOTE_STEPS, action);
}

/**
 * What a change-request write makes stale: approvals are raised by "send to client", tasks and
 * milestones by "create tasks", and the dashboards count open requests.
 */
export const CHANGE_REQUEST_INVALIDATES = [
  ['change-requests'],
  ['approvals'],
  ['tasks'],
  ['milestones'],
  ['contracts'],
  ['dashboard'],
] as const;
