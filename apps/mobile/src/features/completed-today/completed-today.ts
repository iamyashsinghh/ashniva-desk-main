import {
  CLIENT_UPDATE_STATUS,
  type ClientUpdateStatus,
  type ClientUpdateSummary,
  type OrganizationOption,
} from '@ashniva/types';

import type { QueryParams } from '../../shared/api/client';
import { formatDate } from '../../shared/format/format';
import type { SegmentOption } from '../../shared/components/navigation-list';
import type { SelectOption } from '../../shared/components/SelectSheet';

/**
 * The rules behind Completed Today, apart from the drawing so they can be tested.
 *
 * The same screen as the web's: the publish queue (client-visible completions waiting for a
 * senior) and what each client already sees. The web lays those side by side; a phone has one
 * column, so they are two tabs.
 */

export type CompletedTodayTab = 'queue' | 'published';

export const COMPLETED_TODAY_TABS: readonly SegmentOption<CompletedTodayTab>[] = [
  { value: 'queue', label: 'Ready to publish', icon: 'hourglass-outline' },
  { value: 'published', label: 'Clients see', icon: 'eye-outline' },
];

/** Keys every client-update write makes stale — the same three the web invalidates. */
export const CLIENT_UPDATE_INVALIDATE: readonly (readonly unknown[])[] = [
  ['client-updates'],
  ['dashboard'],
  ['tasks'],
];

/**
 * `GET /client-updates` for one side of the screen.
 *
 * The queue is every pending update whatever its work date — something approved yesterday and not
 * yet published is still waiting — so only the published side carries the date.
 */
export function updatesQuery(
  status: ClientUpdateStatus,
  clientId: string | null,
  date?: string,
): QueryParams {
  return {
    status,
    ...(date ? { date } : {}),
    ...(clientId ? { clientOrganizationId: clientId } : {}),
  };
}

export function updatesKey(
  status: ClientUpdateStatus,
  clientId: string | null,
  date?: string,
): readonly unknown[] {
  return ['client-updates', 'completed-today', status, clientId ?? 'all', date ?? 'any'];
}

/** Clients only: our own organization is never somebody an update is published to. */
export function clientOptions(organizations: readonly OrganizationOption[]): SelectOption[] {
  return organizations
    .filter((organization) => !organization.isServiceProvider)
    .map((organization) => ({
      value: organization.id,
      label: organization.name,
      icon: 'business-outline',
      iconTone: 'teal',
    }));
}

/** "What clients see", or the chosen client's name — the web card's own title. */
export function audienceName(
  organizations: readonly OrganizationOption[],
  clientId: string | null,
): string {
  if (!clientId) {
    return 'clients';
  }
  return organizations.find((organization) => organization.id === clientId)?.name ?? 'the client';
}

export const PUBLISH_REFUSED = 'Only seniors, managers or admins publish';
export const EDIT_REFUSED = 'Only seniors, managers or admins edit the wording';

/** Why "Publish all" cannot be pressed, or null when it can. */
export function publishAllBlocked(canPublish: boolean, count: number): string | null {
  if (!canPublish) {
    return PUBLISH_REFUSED;
  }
  return count === 0 ? 'Nothing to publish' : null;
}

/** The line under an update's title: who, where and when, as the web row prints it. */
export function updateMeta(update: ClientUpdateSummary): string {
  const parts = [
    update.clientOrganization.name,
    update.project.name,
    update.author.name,
    formatDate(update.workDate) ?? update.workDate,
  ];
  if (update.publishedBy) {
    parts.push(`published by ${update.publishedBy.name}`);
  }
  return parts.join(' · ');
}

export function isPublished(update: ClientUpdateSummary): boolean {
  return update.status === CLIENT_UPDATE_STATUS.PUBLISHED;
}

/** A day written out in full, for the heading of the published list. */
export function longDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export type WordingErrors = Partial<Record<'title' | 'body', string>>;

/** The edit DTO's bounds (3–200 and 3–2000), checked here so a short edit is not a round trip. */
export function validateWording(title: string, body: string): WordingErrors {
  const errors: WordingErrors = {};
  if (title.trim().length < 3) {
    errors.title = 'Give the update a title of at least 3 characters';
  }
  if (body.trim().length < 3) {
    errors.body = 'Write at least 3 characters for the client to read';
  }
  return errors;
}
