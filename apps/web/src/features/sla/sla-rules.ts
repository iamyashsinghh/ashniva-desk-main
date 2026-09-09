import { PRIORITY, type Priority } from '@ashniva/types';

/** Editable form of one SLA rule: the API stores minutes, people think in hours. */
export interface RuleDraft {
  firstResponseHours: string;
  resolutionHours: string;
}

export type RuleDrafts = Record<Priority, RuleDraft>;

export const PRIORITIES = Object.values(PRIORITY);
