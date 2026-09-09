export const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

/**
 * Least to most urgent.
 *
 * Written down because a support tier can set a floor — "nothing from this product is filed below
 * HIGH" — and comparing two priorities needs an order that is stated once rather than inferred
 * from the declaration order of an object, which is not a promise anybody should rely on.
 */
export const PRIORITY_ORDER: readonly Priority[] = [
  PRIORITY.LOW,
  PRIORITY.MEDIUM,
  PRIORITY.HIGH,
  PRIORITY.CRITICAL,
];

/** True when `candidate` is at least as urgent as `floor`. */
export function isAtLeastAsUrgent(candidate: Priority, floor: Priority): boolean {
  return PRIORITY_ORDER.indexOf(candidate) >= PRIORITY_ORDER.indexOf(floor);
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};
