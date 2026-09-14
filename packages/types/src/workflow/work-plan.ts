/**
 * Project work-plan timing.
 *
 * This is not a person-wide productivity score. It is the on-time percentage for work taken from
 * a project's own phase plan: 100 at the start of the plan, stepped down when a started point's
 * timer runs out before the point is marked done. Opening the plan re-checks overdue points so
 * the number on screen is the live one.
 */

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

export function dueAtFromStart(startedAt: Date, estimateMinutes: number): Date {
  return new Date(startedAt.getTime() + Math.max(1, estimateMinutes) * 60_000);
}

/** Seconds left on the clock. Zero once the point is done or the timer has run out. */
export function remainingSeconds(
  dueAt: Date | string | null,
  now: Date,
  completedAt: Date | string | null,
): number {
  if (!dueAt || completedAt) {
    return 0;
  }
  return Math.max(0, Math.floor((new Date(dueAt).getTime() - now.getTime()) / 1000));
}

export function isWorkPlanOverdue(
  dueAt: Date | string | null,
  now: Date,
  completedAt: Date | string | null,
): boolean {
  if (!dueAt || completedAt) {
    return false;
  }
  return new Date(dueAt).getTime() <= now.getTime();
}

export function scoreAfterPenalty(percent: number, missedPoints = 1): number {
  return Math.max(0, percent - WORK_PLAN_PENALTY_PERCENT * missedPoints);
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
  return line.replace(/^[-*•–]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
}

function cleanHeading(line: string): string {
  return line.replace(/^(phase|module|sprint|week|chapter|part|stage)\s*\d*\s*[:.\-]?\s*/i, '').trim() || line;
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
    const titles: WorkPlanDraftTitle[] = [];
    const titleRows = arrayOf(row.titles ?? row.sections);
    for (const titleRow of titleRows) {
      if (titles.length >= MAX_TITLES || !isRecord(titleRow)) {
        continue;
      }
      const title = clip(stringOf(titleRow.title) ?? stringOf(titleRow.name), MAX_HEADING);
      const points: WorkPlanDraftPoint[] = [];
      const pointRows = arrayOf(titleRow.points ?? titleRow.steps ?? titleRow.items);
      for (const pointRow of pointRows) {
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
    if (heading && titles.length > 0) {
      phases.push({ heading, titles });
    }
  }
  return phases;
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
  const body = clip(stringOf(value.body) ?? stringOf(value.description) ?? stringOf(value.text), MAX_BODY);
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
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
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
