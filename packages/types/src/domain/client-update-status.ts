/**
 * A client update is written when work is completed with "client-visible" switched on.
 * It waits for a Senior / Project Manager to publish it; only PUBLISHED updates reach the portal.
 */
export const CLIENT_UPDATE_STATUS = {
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type ClientUpdateStatus = (typeof CLIENT_UPDATE_STATUS)[keyof typeof CLIENT_UPDATE_STATUS];

export const CLIENT_UPDATE_STATUS_LABELS: Record<ClientUpdateStatus, string> = {
  PENDING: 'Waiting to publish',
  PUBLISHED: 'Published',
  WITHDRAWN: 'Withdrawn',
};
