/**
 * Finds task references in commit messages, branch names and pull/merge-request titles.
 *
 * Two forms are recognised, because two different things write them:
 *   - `TSK-123`   the generic form a developer types, resolved against the repository's project
 *   - `ACM-14`    the key the app itself shows (project code + task number)
 *
 * Branch names use `/` and `_` as separators (`feature/ACM-14-checkout-fix`), so the boundary
 * check cannot simply be `\b` on both sides — `ACM-14` inside `feature/ACM-14-fix` must match,
 * while `ACM-14` inside `XACM-142` must not.
 */

export interface TaskReference {
  /** Uppercased prefix: 'TSK' for the generic form, otherwise the project code. */
  prefix: string;
  number: number;
  /** True when the reference names no specific project and needs the repository's project. */
  generic: boolean;
  /** The text as written, for display. */
  raw: string;
}

/**
 * A project code is 2–10 letters/digits. The lookahead stops `ACM-14` matching inside `ACM-142`,
 * and the lookbehind stops it matching inside `XACM-14`.
 */
const REFERENCE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,7})(?![A-Za-z0-9])/g;

/** The generic prefix that means "a task number, project implied by the repository link". */
export const GENERIC_TASK_PREFIX = 'TSK';

/**
 * Every distinct reference in the text, in the order first seen.
 *
 * Deliberately permissive about what it collects and strict about what it resolves: a commit
 * message mentioning `UTF-8` produces a reference here, and then simply fails to resolve to a
 * task. Filtering plausible-looking prefixes at this stage would be guesswork.
 */
export function parseTaskReferences(...texts: (string | null | undefined)[]): TaskReference[] {
  const seen = new Map<string, TaskReference>();

  for (const text of texts) {
    if (!text) {
      continue;
    }
    for (const match of text.matchAll(REFERENCE)) {
      const prefix = (match[1] ?? '').toUpperCase();
      const number = Number.parseInt(match[2] ?? '', 10);
      if (!Number.isSafeInteger(number) || number <= 0) {
        continue;
      }
      const key = `${prefix}-${number}`;
      if (!seen.has(key)) {
        seen.set(key, {
          prefix,
          number,
          generic: prefix === GENERIC_TASK_PREFIX,
          raw: match[0] ?? key,
        });
      }
    }
  }

  return [...seen.values()];
}

/**
 * Splits references into the lookups a repository needs:
 *   - `numbers`  task numbers to resolve inside the linked project (generic references)
 *   - `keyed`    project-code + number pairs, which may point at another project entirely
 *
 * Resolution stays in the service, where the organization scope is applied; this function only
 * shapes the question.
 */
export function groupReferences(references: TaskReference[]): {
  numbers: number[];
  keyed: { code: string; number: number }[];
} {
  const numbers: number[] = [];
  const keyed: { code: string; number: number }[] = [];

  for (const reference of references) {
    if (reference.generic) {
      numbers.push(reference.number);
    } else {
      keyed.push({ code: reference.prefix, number: reference.number });
    }
  }

  return { numbers, keyed };
}
