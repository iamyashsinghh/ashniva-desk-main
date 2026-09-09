import {
  PROJECT_HEALTH_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectHealth,
  type ProjectStatus,
} from '@ashniva/types';

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
