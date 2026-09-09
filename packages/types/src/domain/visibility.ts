/**
 * Every comment, update, file and estimate carries a visibility.
 * INTERNAL rows are never serialized into client-portal responses.
 */
export const VISIBILITY = {
  INTERNAL: 'INTERNAL',
  CLIENT: 'CLIENT',
} as const;

export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  INTERNAL: 'Internal',
  CLIENT: 'Client-visible',
};
