/**
 * A task category's kind selects its workflow:
 * DEVELOPMENT follows the full review → QA → release chain, everything else uses the short path.
 */
export const TASK_CATEGORY_KIND = {
  DEVELOPMENT: 'DEVELOPMENT',
  MANAGEMENT: 'MANAGEMENT',
  REVIEW: 'REVIEW',
  TESTING: 'TESTING',
  OTHER: 'OTHER',
} as const;

export type TaskCategoryKind = (typeof TASK_CATEGORY_KIND)[keyof typeof TASK_CATEGORY_KIND];

export interface SeedTaskCategory {
  name: string;
  kind: TaskCategoryKind;
}

/** Seeded categories (admin-editable later). Order is the display order. */
export const DEFAULT_TASK_CATEGORIES: readonly SeedTaskCategory[] = [
  { name: 'Development', kind: TASK_CATEGORY_KIND.DEVELOPMENT },
  { name: 'Management', kind: TASK_CATEGORY_KIND.MANAGEMENT },
  { name: 'Review', kind: TASK_CATEGORY_KIND.REVIEW },
  { name: 'Testing', kind: TASK_CATEGORY_KIND.TESTING },
  { name: 'Planning', kind: TASK_CATEGORY_KIND.MANAGEMENT },
  { name: 'Client Meeting', kind: TASK_CATEGORY_KIND.MANAGEMENT },
  { name: 'Team Follow-up', kind: TASK_CATEGORY_KIND.MANAGEMENT },
  { name: 'Release Approval', kind: TASK_CATEGORY_KIND.MANAGEMENT },
  { name: 'Documentation', kind: TASK_CATEGORY_KIND.OTHER },
  { name: 'Administrative', kind: TASK_CATEGORY_KIND.OTHER },
];
