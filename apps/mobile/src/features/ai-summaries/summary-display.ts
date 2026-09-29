import {
  AI_SUMMARY_STATUS,
  AI_SUMMARY_STATUS_LABELS,
  isClientFacingSummary,
  type AiSummaryDetail,
  type AiSummaryStatus,
  type AiSummaryType,
} from '@ashniva/types';

import type { IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';

/**
 * The summary workflow as the screens need it: the list's views, a status's colour, and which
 * review buttons a person is offered.
 *
 * The buttons follow the rules the API enforces (`AI_SUMMARY_TRANSITIONS` plus each route's
 * permission), so nothing is offered that would be refused. The API remains the control.
 */

export type SummaryView = 'open' | 'review' | 'published' | 'all';

export const SUMMARY_VIEWS: Record<SummaryView, { label: string; statuses?: AiSummaryStatus[] }> = {
  open: {
    label: 'In progress',
    statuses: [
      AI_SUMMARY_STATUS.DRAFT,
      AI_SUMMARY_STATUS.GENERATING,
      AI_SUMMARY_STATUS.GENERATION_FAILED,
      AI_SUMMARY_STATUS.CHANGES_REQUESTED,
    ],
  },
  review: {
    label: 'Waiting on review',
    statuses: [AI_SUMMARY_STATUS.IN_REVIEW, AI_SUMMARY_STATUS.APPROVED],
  },
  published: { label: 'Published', statuses: [AI_SUMMARY_STATUS.PUBLISHED] },
  all: { label: 'All' },
};

const STATUS_TONES: Record<AiSummaryStatus, PillTone> = {
  DRAFT: 'neutral',
  GENERATING: 'progress',
  GENERATION_FAILED: 'danger',
  IN_REVIEW: 'warning',
  CHANGES_REQUESTED: 'warning',
  APPROVED: 'info',
  PUBLISHED: 'success',
  CANCELLED: 'neutral',
};

export function summaryStatusTone(status: AiSummaryStatus): PillTone {
  return STATUS_TONES[status] ?? 'neutral';
}

export function summaryStatusLabel(status: AiSummaryStatus): string {
  return AI_SUMMARY_STATUS_LABELS[status] ?? status;
}

/** The leading tile's colour: the pill's meaning, in the icon palette. */
export function summaryIconTone(status: AiSummaryStatus): IconTone {
  const tone = summaryStatusTone(status);
  return tone === 'progress' ? 'info' : tone;
}

/** Types that summarise one person's day rather than a project's. */
export const PERSON_TYPES: readonly AiSummaryType[] = ['DEVELOPER_DAILY', 'LEAD_DAILY'];

/** The text can be written and regenerated only before it goes for review. */
export function isEditable(status: AiSummaryStatus): boolean {
  return (
    status === AI_SUMMARY_STATUS.DRAFT ||
    status === AI_SUMMARY_STATUS.CHANGES_REQUESTED ||
    status === AI_SUMMARY_STATUS.GENERATION_FAILED
  );
}

export interface SummaryPermissions {
  canGenerate: boolean;
  canApprove: boolean;
  canPublishToClients: boolean;
}

export interface SummaryActions {
  generate: boolean;
  submit: boolean;
  approve: boolean;
  requestChanges: boolean;
  publish: boolean;
  reopen: boolean;
  cancel: boolean;
  /** Why an offered action cannot be pressed yet, when one cannot. */
  notes: string[];
}

/** Which review actions this person may take on this summary, right now. */
export function summaryActions(
  summary: Pick<AiSummaryDetail, 'status' | 'type' | 'internalContent' | 'clientContent'>,
  perms: SummaryPermissions,
): SummaryActions {
  const { status } = summary;
  const editable = isEditable(status) && perms.canGenerate;
  const canPublish =
    status === AI_SUMMARY_STATUS.APPROVED &&
    isClientFacingSummary(summary.type) &&
    perms.canApprove &&
    perms.canPublishToClients;
  const notes: string[] = [];
  if (editable && !summary.internalContent) {
    notes.push('Generate or write the summary before sending it for review.');
  }
  if (canPublish && !summary.clientContent) {
    notes.push('There is no client version to publish yet.');
  }
  return {
    generate: editable,
    submit: editable,
    approve: status === AI_SUMMARY_STATUS.IN_REVIEW && perms.canApprove,
    requestChanges: status === AI_SUMMARY_STATUS.IN_REVIEW && perms.canApprove,
    publish: canPublish,
    reopen:
      (status === AI_SUMMARY_STATUS.APPROVED || status === AI_SUMMARY_STATUS.CANCELLED) &&
      perms.canGenerate,
    // Not while generating: the API's cancel transition does not start from there.
    cancel:
      status !== AI_SUMMARY_STATUS.PUBLISHED &&
      status !== AI_SUMMARY_STATUS.CANCELLED &&
      status !== AI_SUMMARY_STATUS.GENERATING &&
      perms.canApprove,
    notes,
  };
}

/** `YYYY-MM-DD` some days back, in the device's own day. */
export function daysAgoIso(days: number, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
