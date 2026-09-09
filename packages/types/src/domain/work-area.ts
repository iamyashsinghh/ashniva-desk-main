/**
 * What a person is responsible for on a project — frontend, backend, the API, and so on.
 *
 * Deliberately **not** an enum the API branches on. A responsibility is data the support router
 * matches against and a manager reads on screen; it is never a fork in the code. Every team names
 * these things slightly differently, and a closed list would mean a migration and a release every
 * time one of them wanted "Integrations" or "Data engineering".
 *
 * So the stored value is a free-form tag and this list is only what the UI offers first. Anything
 * a manager types is equally valid, and `normalizeWorkArea` is what stops "frontend", "Frontend "
 * and "FRONTEND" from becoming three different responsibilities that a router would treat as
 * unrelated.
 */
export const WORK_AREAS = [
  'Frontend',
  'Backend',
  'Mobile',
  'API',
  'Database',
  'DevOps',
  'Full Stack',
  'QA',
  'Design',
  'Integrations',
] as const;

export type SuggestedWorkArea = (typeof WORK_AREAS)[number];

/** The longest a responsibility may be, so one cannot be used to smuggle prose into a tag. */
export const WORK_AREA_MAX_LENGTH = 40;

/** The most responsibilities one person may carry on one project. */
export const MAX_WORK_AREAS = 12;

/**
 * Trims a responsibility and matches it to a suggestion case-insensitively.
 *
 * A tag typed as "backend" becomes "Backend" so it groups with everyone else's, while a tag that
 * matches nothing keeps exactly the capitalisation the manager chose — it is their word, not ours.
 */
export function normalizeWorkArea(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const suggestion = WORK_AREAS.find((area) => area.toLowerCase() === trimmed.toLowerCase());
  return suggestion ?? trimmed;
}

/**
 * Cleans a list of responsibilities: trimmed, normalised, de-duplicated, empties dropped.
 *
 * De-duplication is case-insensitive and happens after normalisation, so ["API", "api"] is one
 * responsibility rather than two that look identical on screen.
 */
export function normalizeWorkAreas(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const area = normalizeWorkArea(value);
    if (area.length === 0 || area.length > WORK_AREA_MAX_LENGTH) {
      continue;
    }
    const key = area.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(area);
  }
  return out.slice(0, MAX_WORK_AREAS);
}

/** Whether a person's responsibilities cover a given area, compared the way tags are stored. */
export function coversWorkArea(responsibilities: readonly string[], area: string): boolean {
  const wanted = normalizeWorkArea(area).toLowerCase();
  return responsibilities.some((entry) => normalizeWorkArea(entry).toLowerCase() === wanted);
}
