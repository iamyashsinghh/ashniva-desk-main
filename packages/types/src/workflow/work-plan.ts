/**
 * Project work-plan timing.
 *
 * This is not a person-wide productivity score. It is the on-time percentage for work taken from
 * a project's own phase plan: 100 at the start of the plan, stepped down when a started point's
 * timer runs out before the point is marked done. Opening the plan re-checks overdue points so
 * the number on screen is the live one.
 */

import { PRIORITY, type Priority } from '../domain/priority';

/** How many percentage points one missed timer takes off this plan's on-time figure. */
export const WORK_PLAN_PENALTY_PERCENT = 5;

/** Used when a phase point has no time written on it. */
export const WORK_PLAN_DEFAULT_ESTIMATE_MINUTES = 30;

export const WORK_PLAN_SOURCE = {
  PDF: 'PDF',
  MANUAL: 'MANUAL',
  MIXED: 'MIXED',
} as const;

export type WorkPlanSource = (typeof WORK_PLAN_SOURCE)[keyof typeof WORK_PLAN_SOURCE];

/**
 * A point's place in the developer → tester loop.
 *
 * The timer starts on the first Start. Send to tester freezes the leftover seconds. The same
 * remaining time resumes when the developer starts again after an error. Good (complete) is what
 * stops the clock for good. Sending it back does not reset the leftover time.
 */
export const WORK_PLAN_POINT_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_TEST: 'AWAITING_TEST',
  TESTING: 'TESTING',
  RETURNED: 'RETURNED',
  COMPLETED: 'COMPLETED',
} as const;

export type WorkPlanPointStatus =
  (typeof WORK_PLAN_POINT_STATUS)[keyof typeof WORK_PLAN_POINT_STATUS];

export const WORK_PLAN_POINT_STATUS_LABELS: Record<WorkPlanPointStatus, string> = {
  PENDING: 'Not started',
  IN_PROGRESS: 'In progress',
  AWAITING_TEST: 'Waiting for tester',
  TESTING: 'Testing',
  RETURNED: 'Returned',
  COMPLETED: 'Done',
};

export const WORK_PLAN_NOTE_KIND = {
  DOUBT: 'DOUBT',
  ISSUE: 'ISSUE',
  REPLY: 'REPLY',
} as const;

export type WorkPlanNoteKind = (typeof WORK_PLAN_NOTE_KIND)[keyof typeof WORK_PLAN_NOTE_KIND];

/** Admin / PM / TL trail: timer start/stop/resume, Send to tester, and tester outcomes. */
export const WORK_PLAN_EVENT_KIND = {
  STARTED: 'STARTED',
  STOPPED: 'STOPPED',
  RESUMED: 'RESUMED',
  SENT_TO_TESTER: 'SENT_TO_TESTER',
  ERROR: 'ERROR',
  PASSED: 'PASSED',
} as const;

export type WorkPlanEventKind = (typeof WORK_PLAN_EVENT_KIND)[keyof typeof WORK_PLAN_EVENT_KIND];

export const WORK_PLAN_EVENT_KIND_LABELS: Record<WorkPlanEventKind, string> = {
  STARTED: 'Started',
  STOPPED: 'Stopped',
  RESUMED: 'Resumed',
  SENT_TO_TESTER: 'Sent to tester',
  ERROR: 'Error',
  PASSED: 'Good',
};

export const WORK_PLAN_NOTE_KIND_LABELS: Record<WorkPlanNoteKind, string> = {
  DOUBT: 'Doubt',
  ISSUE: 'Issue',
  REPLY: 'Reply',
};

/** Groups reply rows under the root note they belong to. Nested replies still sit on the root. */
export function nestWorkPlanNotes<T extends { id: string; parentId: string | null }>(
  notes: readonly T[],
): Array<T & { replies: T[] }> {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const replies = new Map<string, T[]>();
  for (const note of notes) {
    if (!note.parentId) {
      continue;
    }
    const parent = byId.get(note.parentId);
    const rootId = parent?.parentId ?? note.parentId;
    const list = replies.get(rootId) ?? [];
    list.push(note);
    replies.set(rootId, list);
  }
  return notes
    .filter((note) => !note.parentId)
    .map((note) => ({ ...note, replies: replies.get(note.id) ?? [] }));
}

export interface WorkPlanDraftPoint {
  body: string;
  estimateMinutes: number;
}

export interface WorkPlanDraftTitle {
  title: string;
  points: WorkPlanDraftPoint[];
}

export interface WorkPlanDraftPhase {
  heading: string;
  titles: WorkPlanDraftTitle[];
}

/** Extra work AI places onto an existing summary. Null phaseId means open a new phase. */
export interface WorkPlanDraftAddition {
  phaseId: string | null;
  heading: string;
  titles: WorkPlanDraftTitle[];
}

export function dueAtFromStart(startedAt: Date, estimateMinutes: number): Date {
  return new Date(startedAt.getTime() + Math.max(1, estimateMinutes) * 60_000);
}

/** Seconds left on the clock. Zero once the point is done or the timer has run out. */
export function remainingSeconds(
  dueAt: Date | string | null,
  now: Date,
  completedAt: Date | string | null,
  pausedRemainingSeconds?: number | null,
): number {
  if (completedAt) {
    return 0;
  }
  if (pausedRemainingSeconds != null) {
    return Math.max(0, pausedRemainingSeconds);
  }
  if (!dueAt) {
    return 0;
  }
  return Math.max(0, Math.floor((new Date(dueAt).getTime() - now.getTime()) / 1000));
}

export function isWorkPlanOverdue(
  dueAt: Date | string | null,
  now: Date,
  completedAt: Date | string | null,
  pausedRemainingSeconds?: number | null,
): boolean {
  if (completedAt) {
    return false;
  }
  if (pausedRemainingSeconds != null) {
    return pausedRemainingSeconds <= 0;
  }
  if (!dueAt) {
    return false;
  }
  return new Date(dueAt).getTime() <= now.getTime();
}

/** Leftover time is frozen with the tester, or on a returned point waiting for Resume. */
export function isWorkPlanTimerFrozen(
  status: WorkPlanPointStatus,
  pausedRemainingSeconds: number | null | undefined,
  completedAt: Date | string | null,
): boolean {
  if (completedAt) {
    return false;
  }
  if (pausedRemainingSeconds != null) {
    return true;
  }
  return (
    status === WORK_PLAN_POINT_STATUS.AWAITING_TEST ||
    status === WORK_PLAN_POINT_STATUS.TESTING ||
    status === WORK_PLAN_POINT_STATUS.RETURNED
  );
}

/** Restores a paused clock: now plus the leftover seconds from Send to tester. */
export function dueAtFromRemaining(now: Date, remaining: number): Date {
  return new Date(now.getTime() + Math.max(0, remaining) * 1000);
}

/** Seconds past due on this run. Zero while leftover time remains or the clock is paused. */
export function extraThisRunSeconds(
  dueAt: Date | string | null,
  now: Date,
  remaining: number,
  pausedRemainingSeconds?: number | null,
): number {
  if (pausedRemainingSeconds != null || remaining > 0 || !dueAt) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - new Date(dueAt).getTime()) / 1000));
}

/**
 * Time beyond the estimate. Frozen leftover is already stored; while the clock runs, extra on
 * this run is added so the count keeps moving until Good. Tester wait does not add extra.
 */
export function extraSeconds(
  storedOverrunSeconds: number,
  dueAt: Date | string | null,
  now: Date,
  completedAt: Date | string | null,
  pausedRemainingSeconds?: number | null,
  freezeAt?: Date | string | null,
): number {
  const stored = Math.max(0, storedOverrunSeconds);
  if (completedAt || pausedRemainingSeconds != null) {
    if (stored > 0) {
      return stored;
    }
    const at = freezeAt ?? completedAt;
    if (!at || !dueAt) {
      return 0;
    }
    return extraThisRunSeconds(dueAt, new Date(at), 0);
  }
  return stored + extraThisRunSeconds(dueAt, now, remainingSeconds(dueAt, now, completedAt, null));
}

/** Wall time from Start (or another instant) to now. */
export function elapsedSeconds(from: Date | string | null, now: Date): number {
  if (!from) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000));
}

export function scoreAfterPenalty(percent: number, missedPoints = 1): number {
  return Math.max(0, percent - WORK_PLAN_PENALTY_PERCENT * missedPoints);
}

export const WORK_PLAN_ASSIGN_SCOPE = {
  PROJECT: 'PROJECT',
  PHASE: 'PHASE',
  TITLE: 'TITLE',
} as const;

export type WorkPlanAssignScope =
  (typeof WORK_PLAN_ASSIGN_SCOPE)[keyof typeof WORK_PLAN_ASSIGN_SCOPE];

/** Title beats phase beats the whole plan. Unassigned levels fall through. */
export function effectiveWorkPlanAssigneeId(
  titleAssignedToId: string | null | undefined,
  phaseAssignedToId: string | null | undefined,
  planAssignedToId: string | null | undefined,
): string | null {
  return titleAssignedToId ?? phaseAssignedToId ?? planAssignedToId ?? null;
}

/** When that assignee was given the work. Title beats phase beats the whole plan. */
export function effectiveWorkPlanAssignedAt(
  title: { assignedToId: string | null | undefined; assignedAt: Date | string | null | undefined },
  phase: { assignedToId: string | null | undefined; assignedAt: Date | string | null | undefined },
  plan: { assignedToId: string | null | undefined; assignedAt: Date | string | null | undefined },
): Date | string | null {
  if (title.assignedToId) {
    return title.assignedAt ?? null;
  }
  if (phase.assignedToId) {
    return phase.assignedAt ?? null;
  }
  if (plan.assignedToId) {
    return plan.assignedAt ?? null;
  }
  return null;
}

/** Title beats phase beats the whole plan. Unset levels fall through to Medium. */
export function effectiveWorkPlanPriority(
  titlePriority: Priority | null | undefined,
  phasePriority: Priority | null | undefined,
  planPriority: Priority | null | undefined,
): Priority {
  return titlePriority ?? phasePriority ?? planPriority ?? PRIORITY.MEDIUM;
}

/** Managers, leads and testers see every title. A developer only sees work assigned to them. */
export function shouldRestrictWorkPlanToAssignee(flags: {
  canAssign: boolean;
  canTest: boolean;
}): boolean {
  return !flags.canAssign && !flags.canTest;
}

/** Drops phases and titles whose effective assignee is not this developer. */
export function workPlanPhasesVisibleToDeveloper<
  T extends { titles: Array<{ effectiveAssignedTo: { id: string } | null }> },
>(phases: T[], userId: string): T[] {
  return phases
    .map((phase) => ({
      ...phase,
      titles: phase.titles.filter((title) => title.effectiveAssignedTo?.id === userId),
    }))
    .filter((phase) => phase.titles.length > 0);
}

const COMBINED_TITLE_MAX = 200;
const COMBINED_BODY_MAX = 4000;
/** Hard ceiling for one combined step — a week of minutes. */
export const WORK_PLAN_COMBINED_ESTIMATE_MAX_MINUTES = 7 * 24 * 60;

/**
 * Builds the kept topic after combining several in the same phase.
 * Minutes from every non-error step are added into one step.
 */
export function combineWorkPlanTitles(input: {
  titles: Array<{ title: string; points: Array<{ body: string; estimateMinutes: number; isError?: boolean }> }>;
}): { title: string; body: string; estimateMinutes: number } {
  if (input.titles.length < 2) {
    throw new Error('Need at least two topics to combine');
  }
  const points = input.titles.flatMap((title) => title.points.filter((point) => !point.isError));
  const estimateMinutes = points.reduce((sum, point) => sum + point.estimateMinutes, 0);
  if (estimateMinutes < 1) {
    throw new Error('Combined topics need at least one minute');
  }
  if (estimateMinutes > WORK_PLAN_COMBINED_ESTIMATE_MAX_MINUTES) {
    throw new Error('Combined time is too large');
  }
  const title = clipCombined(
    input.titles.map((item) => item.title.trim()).filter(Boolean).join(' · '),
    COMBINED_TITLE_MAX,
  );
  const body = clipCombined(
    points
      .map((point) => point.body.trim())
      .filter(Boolean)
      .join('\n'),
    COMBINED_BODY_MAX,
  );
  return {
    title: title || 'Combined topic',
    body: body || title || 'Combined topic',
    estimateMinutes,
  };
}

function clipCombined(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Buttons on one point, derived from status and who is looking. */
export function workPlanPointActions(input: {
  status: WorkPlanPointStatus;
  startedById: string | null;
  actorId: string;
  canWork: boolean;
  canTest: boolean;
  canLead: boolean;
  assignedToId?: string | null;
  /** Tester-error row. Start resumes the parent point's leftover time. */
  isError?: boolean;
  /** Parent still has an error step that has not been started. */
  hasOpenErrorChild?: boolean;
  /** Clock frozen (Send to tester, logout, or returned). Developer must Start again to continue. */
  timerPaused?: boolean;
}): {
  canStart: boolean;
  canSubmitTest: boolean;
  canStartTest: boolean;
  canPass: boolean;
  canFail: boolean;
  canDoubt: boolean;
  canReply: boolean;
} {
  const {
    status,
    startedById,
    actorId,
    canWork,
    canTest,
    canLead,
    assignedToId,
    isError,
    hasOpenErrorChild,
    timerPaused,
  } = input;
  const done = status === WORK_PLAN_POINT_STATUS.COMPLETED;
  const starter = startedById === actorId;
  const reviewer = canTest || canLead;
  const onTeam = canWork || canTest || canLead;
  /** Testers skip development Start; they wait for Send to tester, then Good or Error. */
  const developer = canWork && !canTest;
  const builder = developer || canLead;
  const owns = canLead || assignedToId === actorId;
  const withTester =
    status === WORK_PLAN_POINT_STATUS.AWAITING_TEST || status === WORK_PLAN_POINT_STATUS.TESTING;
  const canBuild = builder && owns;
  const pausedInProgress =
    Boolean(timerPaused) && status === WORK_PLAN_POINT_STATUS.IN_PROGRESS;
  return {
    canStart: isError
      ? canBuild && status === WORK_PLAN_POINT_STATUS.PENDING
      : canBuild &&
        !hasOpenErrorChild &&
        (status === WORK_PLAN_POINT_STATUS.PENDING ||
          status === WORK_PLAN_POINT_STATUS.RETURNED ||
          pausedInProgress),
    canSubmitTest:
      !isError &&
      canBuild &&
      status === WORK_PLAN_POINT_STATUS.IN_PROGRESS &&
      !timerPaused &&
      (starter || canLead),
    canStartTest: !isError && reviewer && status === WORK_PLAN_POINT_STATUS.AWAITING_TEST,
    canPass: !isError && reviewer && withTester,
    canFail: !isError && reviewer && withTester,
    canDoubt: onTeam && !done,
    canReply: onTeam,
  };
}

/**
 * Turns free text (from a PDF or a paste) into phases, titles and timed points.
 *
 * Headings such as "Phase 1" or a short all-caps line open a phase. "Title 1" or a numbered
 * "1. …" line opens a title. Bullets become points; a trailing "30m" / "2h" becomes the estimate.
 */
export function parseWorkPlanFromText(text: string): WorkPlanDraftPhase[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const phases: WorkPlanDraftPhase[] = [];
  let phase: WorkPlanDraftPhase = { heading: 'Phase 1', titles: [] };
  let title: WorkPlanDraftTitle = { title: 'Title 1', points: [] };

  const flushTitle = (): void => {
    if (title.points.length > 0 || title.title !== 'Title 1' || phase.titles.length === 0) {
      phase.titles.push(title);
    }
    title = { title: `Title ${phase.titles.length + 1}`, points: [] };
  };
  const flushPhase = (): void => {
    flushTitle();
    if (phase.titles.some((row) => row.points.length > 0) || phase.heading !== 'Phase 1') {
      phases.push(phase);
    }
    phase = { heading: `Phase ${phases.length + 1}`, titles: [] };
    title = { title: 'Title 1', points: [] };
  };

  for (const line of lines) {
    const time = extractEstimate(line);
    const body = stripEstimate(line);

    if (isPhaseHeading(body) && (title.points.length > 0 || phase.titles.length > 0)) {
      flushPhase();
      phase.heading = cleanHeading(body);
      continue;
    }
    if (isPhaseHeading(body) && phase.titles.length === 0 && title.points.length === 0) {
      phase.heading = cleanHeading(body);
      continue;
    }
    if (isTitleHeading(body) && title.points.length > 0) {
      flushTitle();
      title.title = cleanTitle(body);
      continue;
    }
    if (isTitleHeading(body) && title.points.length === 0) {
      title.title = cleanTitle(body);
      continue;
    }
    if (isBullet(line) || title.points.length > 0 || isTitleHeading(phase.heading) === false) {
      const pointBody = stripBullet(body);
      if (pointBody.length > 0) {
        title.points.push({
          body: pointBody,
          estimateMinutes: time ?? WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
        });
      }
    }
  }

  flushPhase();
  return phases.filter((row) => row.titles.some((item) => item.points.length > 0));
}

/**
 * Turns a manager's short request ("OTP login and forgot password") into a draft phase when
 * Gemini is off or the model returns nothing usable.
 */
export function workPlanFromFreeText(prompt: string): WorkPlanDraftPhase[] {
  const parsed = parseWorkPlanFromText(prompt);
  if (parsed.length > 0) {
    return parsed;
  }
  const body = prompt.replace(/\s+/g, ' ').trim();
  if (body.length < 8) {
    return [];
  }
  const heading =
    body
      .slice(0, 80)
      .replace(/[,.].*$/, '')
      .trim() || 'New phase';
  return [
    {
      heading,
      titles: [
        {
          title: heading,
          points: [{ body, estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
        },
      ],
    },
  ];
}

function isPhaseHeading(line: string): boolean {
  if (/^(phase|module|sprint|week|chapter|part|stage)\b/i.test(line)) {
    return true;
  }
  return line.length <= 80 && line === line.toUpperCase() && /[A-Z]/.test(line) && !isBullet(line);
}

function isTitleHeading(line: string): boolean {
  return /^(title|section|feature|task)\s*\d+\b/i.test(line) || /^\d+\.\s+\S/.test(line);
}

function isBullet(line: string): boolean {
  return /^[-*•–]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
}

function stripBullet(line: string): string {
  return line
    .replace(/^[-*•–]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

function cleanHeading(line: string): string {
  return (
    line.replace(/^(phase|module|sprint|week|chapter|part|stage)\s*\d*\s*[:.\-]?\s*/i, '').trim() ||
    line
  );
}

function cleanTitle(line: string): string {
  return line.replace(/^(title|section|feature|task)\s*\d+\s*[:.\-]?\s*/i, '').trim() || line;
}

function extractEstimate(line: string): number | null {
  const hours = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(line);
  if (hours) {
    return Math.max(1, Math.round(Number(hours[1]) * 60));
  }
  const minutes = /\b(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(line);
  if (minutes) {
    return Math.max(1, Number(minutes[1]));
  }
  return null;
}

function stripEstimate(line: string): string {
  return line
    .replace(/\s*[–-]\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*$/i, '')
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*\)\s*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*$/i, '')
    .trim();
}

const MAX_PHASES = 40;
const MAX_TITLES = 30;
const MAX_POINTS = 40;
const MAX_HEADING = 200;
const MAX_BODY = 4000;
const MAX_MINUTES = 24 * 60;

/**
 * Turns a model JSON payload into the same draft shape the PDF outline parser produces.
 *
 * Accepts the object, a JSON string, or a fenced ```json block. Unknown keys are ignored; empty
 * or invalid rows are dropped rather than invented.
 */
export function workPlanFromModelJson(raw: unknown): WorkPlanDraftPhase[] {
  const parsed = typeof raw === 'string' ? parseJsonObject(raw) : raw;
  const rows = phasesOf(parsed);
  const phases: WorkPlanDraftPhase[] = [];
  for (const row of rows) {
    if (phases.length >= MAX_PHASES || !isRecord(row)) {
      continue;
    }
    const heading = clip(stringOf(row.heading) ?? stringOf(row.name), MAX_HEADING);
    const titles = titlesFromRow(row);
    if (heading && titles.length > 0) {
      phases.push({ heading, titles });
    }
  }
  return phases;
}

/**
 * AI add-on payload: attach new titles to an existing phase id, or open a new phase.
 * Also accepts the older `{ phases: [...] }` shape and treats every row as a new phase.
 */
export function workPlanAdditionsFromModelJson(raw: unknown): WorkPlanDraftAddition[] {
  const parsed = typeof raw === 'string' ? parseJsonObject(raw) : raw;
  if (isRecord(parsed) && parsed.additions !== undefined) {
    const additions: WorkPlanDraftAddition[] = [];
    for (const row of arrayOf(parsed.additions)) {
      if (additions.length >= MAX_PHASES || !isRecord(row)) {
        continue;
      }
      const titles = titlesFromRow(row);
      const heading = clip(stringOf(row.heading) ?? stringOf(row.name), MAX_HEADING);
      if (titles.length === 0 || !heading) {
        continue;
      }
      additions.push({
        phaseId: uuidOf(row.phaseId),
        heading,
        titles,
      });
    }
    return additions;
  }
  return workPlanFromModelJson(parsed).map((phase) => ({
    phaseId: null,
    heading: phase.heading,
    titles: phase.titles,
  }));
}

/** Existing phase by id, then heading; undefined means open a new phase. */
export function matchWorkPlanAdditionPhase<T extends { id?: string; heading: string }>(
  addition: WorkPlanDraftAddition,
  phases: T[],
): T | undefined {
  if (addition.phaseId) {
    const byId = phases.find((phase) => phase.id === addition.phaseId);
    if (byId) {
      return byId;
    }
  }
  const wanted = addition.heading.trim().toLowerCase();
  if (!wanted) {
    return undefined;
  }
  return phases.find((phase) => phase.heading.trim().toLowerCase() === wanted);
}

function titlesFromRow(row: Record<string, unknown>): WorkPlanDraftTitle[] {
  const titles: WorkPlanDraftTitle[] = [];
  for (const titleRow of arrayOf(row.titles ?? row.sections)) {
    if (titles.length >= MAX_TITLES || !isRecord(titleRow)) {
      continue;
    }
    const title = clip(stringOf(titleRow.title) ?? stringOf(titleRow.name), MAX_HEADING);
    const points: WorkPlanDraftPoint[] = [];
    for (const pointRow of arrayOf(titleRow.points ?? titleRow.steps ?? titleRow.items)) {
      if (points.length >= MAX_POINTS) {
        continue;
      }
      const point = pointOf(pointRow);
      if (point) {
        points.push(point);
      }
    }
    if (title && points.length > 0) {
      titles.push({ title, points });
    }
  }
  return titles;
}

function uuidOf(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function phasesOf(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }
  return arrayOf(value.phases ?? value.plan);
}

function pointOf(value: unknown): WorkPlanDraftPoint | null {
  if (typeof value === 'string') {
    const body = clip(value, MAX_BODY);
    return body ? { body, estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES } : null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const body = clip(
    stringOf(value.body) ?? stringOf(value.description) ?? stringOf(value.text),
    MAX_BODY,
  );
  if (!body) {
    return null;
  }
  return { body, estimateMinutes: minutesOf(value.estimateMinutes ?? value.minutes) };
}

function minutesOf(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return WORK_PLAN_DEFAULT_ESTIMATE_MINUTES;
  }
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(n)));
}

function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clip(value: string | null, max: number): string {
  return value ? value.slice(0, max).trim() : '';
}
