/**
 * A support call, as Desk records it.
 *
 * Desk does not place calls. Ashniva IVR does. What Desk owns is the *decision* — whether a call
 * may happen at all, who it should reach, what happens when nobody answers — and the *record*:
 * which ticket the call belonged to, who was on it, how long it lasted, and where the recording
 * lives. Everything in this file is about those two things, and nothing in it describes telephony.
 *
 * The names here are not new. `IvrProvider` in the API already speaks of `call.started`,
 * `call.answered`, `call.no_answer`, `call.ended` and `recording.ready`; the statuses below are
 * the states those events move a call between, and the mapping between the two is in this file so
 * that a provider adapter never has to invent one.
 */

/**
 * Where a call is in its life.
 *
 * `REQUESTED` is Desk's own state: somebody pressed the button and a target has been chosen, but
 * the provider has not yet been asked, or has been asked and has not yet said anything. Every
 * other state is something the provider told us. The four terminal ones are the ways a call can
 * stop mattering, and they are kept distinct because "nobody picked up" and "the line was busy"
 * lead to different next steps for the person who was trying to get help.
 */
export const CALL_STATUS = {
  REQUESTED: 'REQUESTED',
  RINGING: 'RINGING',
  CONNECTED: 'CONNECTED',
  COMPLETED: 'COMPLETED',
  NO_ANSWER: 'NO_ANSWER',
  BUSY: 'BUSY',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  REQUESTED: 'Requested',
  RINGING: 'Ringing',
  CONNECTED: 'Connected',
  COMPLETED: 'Completed',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/** A call in one of these is over: no event moves it again, and no further attempt is made. */
export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
  CALL_STATUS.COMPLETED,
  CALL_STATUS.NO_ANSWER,
  CALL_STATUS.BUSY,
  CALL_STATUS.FAILED,
  CALL_STATUS.CANCELLED,
];

/** Statuses in which a call is still live and can still be cancelled by a person. */
export const LIVE_CALL_STATUSES: readonly CallStatus[] = [
  CALL_STATUS.REQUESTED,
  CALL_STATUS.RINGING,
  CALL_STATUS.CONNECTED,
];

/**
 * The transitions a call may make.
 *
 * Written down rather than assumed because provider events arrive out of order. A `call.ended`
 * that overtakes its `call.answered` must not roll a connected call back to ringing, and a
 * redelivered `call.started` must not resurrect a completed one. The graph is what makes both
 * of those a no-op instead of a corruption.
 */
export const CALL_STATUS_TRANSITIONS: Record<CallStatus, readonly CallStatus[]> = {
  REQUESTED: [
    CALL_STATUS.RINGING,
    CALL_STATUS.CONNECTED,
    CALL_STATUS.NO_ANSWER,
    CALL_STATUS.BUSY,
    CALL_STATUS.FAILED,
    CALL_STATUS.CANCELLED,
  ],
  RINGING: [
    CALL_STATUS.CONNECTED,
    CALL_STATUS.NO_ANSWER,
    CALL_STATUS.BUSY,
    CALL_STATUS.FAILED,
    CALL_STATUS.CANCELLED,
  ],
  // A connected call can only end. "No answer" after somebody answered is a contradiction, and
  // an out-of-order no-answer event for an earlier ring must not overwrite the answer.
  CONNECTED: [CALL_STATUS.COMPLETED, CALL_STATUS.FAILED],
  COMPLETED: [],
  NO_ANSWER: [],
  BUSY: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionCall(from: CallStatus, to: CallStatus): boolean {
  return CALL_STATUS_TRANSITIONS[from].includes(to);
}

export function isCallTerminal(status: CallStatus): boolean {
  return TERMINAL_CALL_STATUSES.includes(status);
}

/**
 * The provider event names the `IvrProvider` adapter already normalises to.
 *
 * Repeated here rather than imported from the API because the web app renders them too, and a
 * second spelling of `recording.ready` in one of the two places is a bug nobody notices until a
 * recording never appears.
 */
export const IVR_CALL_EVENT_TYPES = [
  'call.started',
  'call.answered',
  'call.no_answer',
  'call.ended',
  'recording.ready',
] as const;

export type IvrCallEventName = (typeof IVR_CALL_EVENT_TYPES)[number];

/**
 * What each provider event means for a call's status.
 *
 * `call.ended` is deliberately absent: what an ended call becomes depends on whether it had been
 * answered, which is a fact about the call and not about the event. `recording.ready` is absent
 * for the same reason — it attaches a recording and changes no status at all.
 */
export const EVENT_STATUS: Partial<Record<IvrCallEventName, CallStatus>> = {
  'call.started': CALL_STATUS.RINGING,
  'call.answered': CALL_STATUS.CONNECTED,
  'call.no_answer': CALL_STATUS.NO_ANSWER,
};

/**
 * Maps whatever word the provider used for how a call finished onto Desk's statuses.
 *
 * Providers disagree about vocabulary — one says `no-answer`, another `noanswer`, a third
 * `NO_ANSWER` — so the comparison is done on a squashed form. Anything unrecognised on a call
 * that never connected is `FAILED` rather than a guess: an unknown disposition is a call that did
 * not help somebody, and recording it as "completed" would hide that.
 *
 * The raw word is stored alongside the status. Mapping is for the parts of Desk that must branch;
 * the original is for the person reading the history, who may know what their provider meant.
 */
export function mapCallDisposition(
  disposition: string | null | undefined,
  wasAnswered: boolean,
): CallStatus {
  const key = (disposition ?? '').toLowerCase().replace(/[^a-z]/g, '');
  switch (key) {
    case 'answered':
    case 'completed':
    case 'connected':
    case 'success':
      return CALL_STATUS.COMPLETED;
    case 'noanswer':
    case 'noresponse':
    case 'timeout':
    case 'unanswered':
      return CALL_STATUS.NO_ANSWER;
    case 'busy':
    case 'rejected':
    case 'declined':
      return CALL_STATUS.BUSY;
    case 'cancelled':
    case 'canceled':
      return CALL_STATUS.CANCELLED;
    case 'failed':
    case 'error':
    case 'congestion':
    case 'unreachable':
      return CALL_STATUS.FAILED;
    default:
      // An end with nothing useful said about it. If somebody was on the call it completed;
      // if nobody ever was, it failed, and the fallback chain should get another go.
      return wasAnswered ? CALL_STATUS.COMPLETED : CALL_STATUS.FAILED;
  }
}

/** Statuses that mean the attempt found nobody, so the next destination should be tried. */
export const RETRYABLE_CALL_STATUSES: readonly CallStatus[] = [
  CALL_STATUS.NO_ANSWER,
  CALL_STATUS.BUSY,
  CALL_STATUS.FAILED,
];

export function shouldTryNextDestination(status: CallStatus): boolean {
  return RETRYABLE_CALL_STATUSES.includes(status);
}
