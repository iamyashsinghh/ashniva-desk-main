import { TICKET_ACTION, type TicketAction, type TicketActionAvailability } from '@ashniva/types';

import type { IconName } from '../../../shared/components/Icon';
import type { ButtonVariant } from '../../../shared/components/primitives';
import { actionWorthShowing } from '../ticket-display';

/**
 * The ticket transitions a person can take, in the web's order.
 *
 * `form` says what the action needs before it can be sent: nothing (it runs on tap), a sentence
 * (a resolution the client reads, or the reason for reopening or cancelling), or its own sheet.
 */
export type ActionForm = 'none' | 'text' | 'assign' | 'convert';

export interface TicketActionSpec {
  action: TicketAction;
  label: string;
  icon: IconName;
  variant: ButtonVariant;
  form: ActionForm;
}

export const TICKET_ACTION_SPECS: readonly TicketActionSpec[] = [
  {
    action: TICKET_ACTION.ASSIGN,
    label: 'Assign',
    icon: 'person-add-outline',
    variant: 'secondary',
    form: 'assign',
  },
  {
    action: TICKET_ACTION.START,
    label: 'Start working on it',
    icon: 'play-outline',
    variant: 'primary',
    form: 'none',
  },
  {
    action: TICKET_ACTION.CONVERT,
    label: 'Convert to task',
    icon: 'git-branch-outline',
    variant: 'secondary',
    form: 'convert',
  },
  {
    action: TICKET_ACTION.WAIT_CLIENT,
    label: 'Wait for client',
    icon: 'hourglass-outline',
    variant: 'secondary',
    form: 'none',
  },
  {
    action: TICKET_ACTION.RESUME,
    label: 'Resume',
    icon: 'play-forward-outline',
    variant: 'primary',
    form: 'none',
  },
  {
    action: TICKET_ACTION.REVIEW,
    label: 'Send for review',
    icon: 'eye-outline',
    variant: 'secondary',
    form: 'none',
  },
  {
    action: TICKET_ACTION.RESOLVE,
    label: 'Resolve',
    icon: 'checkmark-circle-outline',
    variant: 'primary',
    form: 'text',
  },
  {
    action: TICKET_ACTION.CLOSE,
    label: 'Close',
    icon: 'lock-closed-outline',
    variant: 'secondary',
    form: 'none',
  },
  {
    action: TICKET_ACTION.REOPEN,
    label: 'Reopen',
    icon: 'refresh',
    variant: 'danger',
    form: 'text',
  },
  {
    action: TICKET_ACTION.CANCEL,
    label: 'Cancel ticket',
    icon: 'close-circle-outline',
    variant: 'dangerGhost',
    form: 'text',
  },
];

/** Which transitions lead on a phone: moving the work forward before tidying it up. */
const PRIMARY_PREFERENCE: readonly TicketAction[] = [
  TICKET_ACTION.START,
  TICKET_ACTION.RESUME,
  TICKET_ACTION.RESOLVE,
  TICKET_ACTION.ASSIGN,
  TICKET_ACTION.REVIEW,
  TICKET_ACTION.CLOSE,
  TICKET_ACTION.REOPEN,
];

export interface OfferedAction extends TicketActionSpec {
  enabled: boolean;
  reason: string | null;
}

/** Every transition worth listing, with the API's answer and, for a refusal, its reason. */
export function offeredActions(actions: readonly TicketActionAvailability[]): OfferedAction[] {
  const byAction = new Map(actions.map((entry) => [entry.action, entry]));
  return TICKET_ACTION_SPECS.flatMap((spec) => {
    const entry = byAction.get(spec.action);
    if (!entry || !actionWorthShowing(entry)) {
      return [];
    }
    return [{ ...spec, enabled: entry.enabled, reason: entry.reason ?? null }];
  });
}

/** The (at most) `limit` enabled actions shown as buttons; the rest live in "More actions". */
export function primaryActions(offered: readonly OfferedAction[], limit = 2): OfferedAction[] {
  return PRIMARY_PREFERENCE.flatMap((action) =>
    offered.filter((entry) => entry.action === action && entry.enabled),
  ).slice(0, limit);
}

export type TextActionKind = 'resolve' | 'reopen' | 'cancel';

export const TEXT_ACTIONS: Record<
  TextActionKind,
  { title: string; label: string; hint: string; submit: string; field: 'resolution' | 'reason' }
> = {
  resolve: {
    title: 'Resolve ticket',
    label: 'What was done',
    hint: 'The requester reads this. Plain language, no internal detail.',
    submit: 'Resolve',
    field: 'resolution',
  },
  reopen: {
    title: 'Reopen ticket',
    label: 'Why is it being reopened?',
    hint: 'Recorded on the ticket’s history.',
    submit: 'Reopen',
    field: 'reason',
  },
  cancel: {
    title: 'Cancel ticket',
    label: 'Reason',
    hint: 'Duplicate, invalid, raised by mistake…',
    submit: 'Cancel ticket',
    field: 'reason',
  },
};
