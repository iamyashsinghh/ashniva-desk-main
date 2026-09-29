import {
  RELEASE_NOTE_ITEM_KIND,
  RELEASE_NOTE_STATUS,
  RELEASE_NOTE_STATUS_LABELS,
  type ReleaseNoteItemKind,
  type ReleaseNoteItemSummary,
  type ReleaseNoteStatus,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import type { ButtonVariant, PillTone } from '../../shared/components/primitives';
import type { TabOption } from '../../shared/components/TabBar';

/**
 * How a release note reads on a phone, in the web's words. Statuses, kinds and their labels come
 * from `@ashniva/types`; only the tones, icons and views are decided here.
 */

const TONES: Record<ReleaseNoteStatus, PillTone> = {
  [RELEASE_NOTE_STATUS.DRAFT]: 'neutral',
  [RELEASE_NOTE_STATUS.IN_REVIEW]: 'warning',
  [RELEASE_NOTE_STATUS.CHANGES_REQUESTED]: 'warning',
  [RELEASE_NOTE_STATUS.APPROVED]: 'success',
  [RELEASE_NOTE_STATUS.PUBLISHED]: 'info',
  [RELEASE_NOTE_STATUS.CANCELLED]: 'neutral',
};

export function releaseNoteTone(status: ReleaseNoteStatus): PillTone {
  return TONES[status] ?? 'neutral';
}

export function releaseNoteStatusLabel(status: ReleaseNoteStatus): string {
  return RELEASE_NOTE_STATUS_LABELS[status] ?? status;
}

export const ITEM_KIND_ICONS: Record<ReleaseNoteItemKind, IconName> = {
  [RELEASE_NOTE_ITEM_KIND.TASK]: 'checkbox-outline',
  [RELEASE_NOTE_ITEM_KIND.TICKET]: 'ticket-outline',
  [RELEASE_NOTE_ITEM_KIND.CLIENT_UPDATE]: 'megaphone-outline',
  [RELEASE_NOTE_ITEM_KIND.CODE_ACTIVITY]: 'code-slash-outline',
  [RELEASE_NOTE_ITEM_KIND.MANUAL]: 'create-outline',
};

/** What the client reads for a line: its client wording when one was written. */
export function lineLabel(item: Pick<ReleaseNoteItemSummary, 'label' | 'clientLabel'>): string {
  return item.clientLabel ?? item.label;
}

export type ReleaseNoteView = 'open' | 'review' | 'published' | 'all';

export const RELEASE_NOTE_VIEWS: Record<
  ReleaseNoteView,
  { label: string; statuses?: ReleaseNoteStatus[] }
> = {
  open: {
    label: 'In progress',
    statuses: [
      RELEASE_NOTE_STATUS.DRAFT,
      RELEASE_NOTE_STATUS.IN_REVIEW,
      RELEASE_NOTE_STATUS.CHANGES_REQUESTED,
      RELEASE_NOTE_STATUS.APPROVED,
    ],
  },
  review: { label: 'Waiting on review', statuses: [RELEASE_NOTE_STATUS.IN_REVIEW] },
  published: { label: 'Published', statuses: [RELEASE_NOTE_STATUS.PUBLISHED] },
  all: { label: 'All' },
};

export const RELEASE_NOTE_VIEW_TABS: readonly TabOption<ReleaseNoteView>[] = [
  { value: 'open', label: RELEASE_NOTE_VIEWS.open.label, icon: 'create-outline' },
  { value: 'review', label: RELEASE_NOTE_VIEWS.review.label, icon: 'hourglass-outline' },
  { value: 'published', label: RELEASE_NOTE_VIEWS.published.label, icon: 'send-outline' },
  { value: 'all', label: RELEASE_NOTE_VIEWS.all.label, icon: 'albums-outline' },
];

/** The API's rule: only a draft, or a note sent back, may be changed. */
export function isEditable(status: ReleaseNoteStatus): boolean {
  return status === RELEASE_NOTE_STATUS.DRAFT || status === RELEASE_NOTE_STATUS.CHANGES_REQUESTED;
}

/** The API's own version rule for a note. */
const VERSION_PATTERN = /^[\w.\-+]{1,40}$/;

export function noteVersionProblem(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed || VERSION_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.length > 40 ? 'At most 40 characters' : 'Letters, digits, . _ + and - only';
}

export type ReleaseNoteStep =
  'submit' | 'approve' | 'request-changes' | 'publish' | 'return-to-draft' | 'cancel';

export interface StepButton {
  step: ReleaseNoteStep;
  label: string;
  icon: IconName;
  variant: ButtonVariant;
  /** The API refuses these without a reason, so they ask for one first. */
  needsNote: boolean;
}

export interface NoteAbilities {
  write: boolean;
  approve: boolean;
  publish: boolean;
}

/**
 * The workflow buttons — the web's `ReleaseNoteActions`. The same status and the same permission
 * decide both, so the phone never offers a step the API answers with 403 or 409.
 */
export function stepButtons(status: ReleaseNoteStatus, can: NoteAbilities): StepButton[] {
  const S = RELEASE_NOTE_STATUS;
  const buttons: StepButton[] = [];
  if (can.write && isEditable(status)) {
    buttons.push({
      step: 'submit',
      label: 'Send for review',
      icon: 'paper-plane-outline',
      variant: 'primary',
      needsNote: false,
    });
  }
  if (can.approve && status === S.IN_REVIEW) {
    buttons.push(
      {
        step: 'approve',
        label: 'Approve',
        icon: 'checkmark',
        variant: 'primary',
        needsNote: false,
      },
      {
        step: 'request-changes',
        label: 'Request changes',
        icon: 'return-down-back-outline',
        variant: 'secondary',
        needsNote: true,
      },
    );
  }
  if (can.publish && status === S.APPROVED) {
    buttons.push({
      step: 'publish',
      label: 'Publish to client',
      icon: 'send',
      variant: 'primary',
      needsNote: false,
    });
  }
  if (
    can.write &&
    (status === S.CHANGES_REQUESTED || status === S.APPROVED || status === S.CANCELLED)
  ) {
    buttons.push({
      step: 'return-to-draft',
      label: 'Reopen for editing',
      icon: 'refresh',
      variant: 'secondary',
      needsNote: false,
    });
  }
  if (can.approve && status !== S.PUBLISHED && status !== S.CANCELLED) {
    buttons.push({
      step: 'cancel',
      label: 'Cancel note',
      icon: 'close-circle-outline',
      variant: 'dangerGhost',
      needsNote: true,
    });
  }
  return buttons;
}
