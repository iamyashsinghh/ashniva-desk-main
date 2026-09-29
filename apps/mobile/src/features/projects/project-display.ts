import {
  MILESTONE_STATUS_TONES,
  TASK_STATUS_TONES,
  TICKET_STATUS_TONES,
  type Tone,
} from '@ashniva/ui/status-tone';
import {
  CLIENT_UPDATE_STATUS,
  PROJECT_HEALTH_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ClientUpdateStatus,
  type MilestoneStatus,
  type ProjectHealth,
  type ProjectStatus,
  type ProjectType,
  type TaskStatus,
  type TicketStatus,
} from '@ashniva/types';

import type { IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';

/**
 * Project status and health, as a pill.
 *
 * Two separate signals and they answer different questions: status is where the project is in its
 * life, health is whether it is in trouble. A project can be perfectly ordinary and at risk, or
 * on hold and fine, so neither colour is derived from the other.
 *
 * There is no shared tone table for these in `@ashniva/ui/status-tone` the way there is for tasks
 * and tickets, so the mapping is here rather than invented in each screen.
 */

const STATUS_TONES: Record<ProjectStatus, PillTone> = {
  PLANNED: 'neutral',
  ACTIVE: 'progress',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
};

const HEALTH_TONES: Record<ProjectHealth, PillTone> = {
  ON_TRACK: 'success',
  AT_RISK: 'warning',
  DELAYED: 'danger',
};

const HEALTH_ICON_TONES: Record<ProjectHealth, IconTone> = {
  ON_TRACK: 'success',
  AT_RISK: 'warning',
  DELAYED: 'danger',
};

/** The colour of a project's leading tile: health, because trouble is what a glance is for. */
export function projectIconTone(health: ProjectHealth): IconTone {
  return HEALTH_ICON_TONES[health] ?? 'primary';
}

export function projectStatusTone(status: ProjectStatus): PillTone {
  return STATUS_TONES[status] ?? 'neutral';
}

export function projectHealthTone(health: ProjectHealth): PillTone {
  return HEALTH_TONES[health] ?? 'neutral';
}

export function projectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function projectHealthLabel(health: ProjectHealth): string {
  return PROJECT_HEALTH_LABELS[health] ?? health;
}

export function projectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPE_LABELS[type] ?? type;
}

/**
 * The shared tables have a `review` tone the native pill does not draw; on a small screen it reads
 * as info. Same mapping the task and ticket screens use, so the apps agree on what is worrying.
 */
function toPillTone(tone: Tone | undefined): PillTone {
  if (!tone) {
    return 'neutral';
  }
  return tone === 'review' ? 'info' : tone;
}

export function milestoneTone(status: MilestoneStatus): PillTone {
  return toPillTone(MILESTONE_STATUS_TONES[status]);
}

export function taskStatusTone(status: TaskStatus): PillTone {
  return toPillTone(TASK_STATUS_TONES[status]);
}

export function ticketStatusTone(status: TicketStatus): PillTone {
  return toPillTone(TICKET_STATUS_TONES[status]);
}

export function clientUpdateTone(status: ClientUpdateStatus): PillTone {
  switch (status) {
    case CLIENT_UPDATE_STATUS.PUBLISHED:
      return 'success';
    case CLIENT_UPDATE_STATUS.PENDING:
      return 'warning';
    default:
      return 'neutral';
  }
}
