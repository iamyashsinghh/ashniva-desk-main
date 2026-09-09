/** Problem / incident record created when the same issue crosses the duplicate threshold. */
export const PROBLEM_STATUS = {
  OPEN: 'OPEN',
  RCA_REQUESTED: 'RCA_REQUESTED',
  RCA_SUBMITTED: 'RCA_SUBMITTED',
  FIX_ASSIGNED: 'FIX_ASSIGNED',
  FIX_RELEASED: 'FIX_RELEASED',
  CLOSED: 'CLOSED',
} as const;

export type ProblemStatus = (typeof PROBLEM_STATUS)[keyof typeof PROBLEM_STATUS];

export const PROBLEM_STATUS_LABELS: Record<ProblemStatus, string> = {
  OPEN: 'Open',
  RCA_REQUESTED: 'RCA requested',
  RCA_SUBMITTED: 'RCA submitted',
  FIX_ASSIGNED: 'Permanent fix assigned',
  FIX_RELEASED: 'Fix released',
  CLOSED: 'Closed',
};

export const CALL_OUTCOME = {
  CONNECTED: 'CONNECTED',
  NO_ANSWER: 'NO_ANSWER',
  CALLBACK_REQUESTED: 'CALLBACK_REQUESTED',
  TRANSFERRED: 'TRANSFERRED',
  VOICEMAIL: 'VOICEMAIL',
} as const;

export type CallOutcome = (typeof CALL_OUTCOME)[keyof typeof CALL_OUTCOME];
