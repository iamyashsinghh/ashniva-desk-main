/**
 * Finding the ticket that is really the same ticket.
 *
 * The approved design is explicit that this stays deterministic for now — "fingerprint + keyword
 * search now; AI similarity behind an interface later" — and that **a person confirms every link**.
 * Nothing here merges anything. It produces a ranked list of candidates and the reasons for each,
 * and somebody with `problem:manage` decides.
 *
 * Keeping the scoring in `packages/types` rather than in the API is what lets the same numbers be
 * exercised exhaustively in unit tests, quoted back on screen as the reason a suggestion appeared,
 * and reused by the threshold job — without three copies that can disagree about what "similar"
 * means.
 */

/** A ticket reduced to the facts the matcher compares. Nothing here identifies a client. */
export interface SimilarityCandidate {
  ticketId: string;
  /** Which product the report is about, when it came through one. */
  productId: string | null;
  /** The area of the product, as captured on the ticket. */
  module: string | null;
  /** The version the reporter was on. */
  productVersion: string | null;
  /** Ticket type, so a billing question is not matched with an outage. */
  type: string;
  /** Words worth comparing, already extracted by `extractKeywords`. */
  keywords: readonly string[];
  /** An error code lifted out of the text, when the reporter quoted one. */
  errorCode: string | null;
}

/**
 * Words that carry no signal in a support title.
 *
 * Taken from the approved prototype unchanged. Every one of them appears in roughly half of all
 * tickets ("Login fails after update", "Cannot print from the invoice screen"), so keeping them
 * would make every ticket look like every other ticket.
 */
const STOP_WORDS = new Set([
  'fails',
  'after',
  'when',
  'with',
  'from',
  'that',
  'this',
  'does',
  'cannot',
  'issue',
]);

/** Words shorter than this are dropped; four characters is where the noise starts. */
const MIN_KEYWORD_LENGTH = 4;

/** A cap, so a pasted stack trace cannot turn one ticket into a match for everything. */
export const MAX_KEYWORDS = 40;

/**
 * The words a ticket is matched on.
 *
 * Lower-cased, split on anything that is not a letter or digit, short words and stop words dropped,
 * de-duplicated, and capped. Deliberately not stemmed: "scanning" and "scanner" staying distinct
 * costs a few matches, and a stemmer costs a dependency plus a class of surprises nobody can
 * explain to a support executive looking at the screen.
 */
export function extractKeywords(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length < MIN_KEYWORD_LENGTH || STOP_WORDS.has(word) || seen.has(word)) {
        continue;
      }
      seen.add(word);
      if (seen.size >= MAX_KEYWORDS) {
        return [...seen];
      }
    }
  }
  return [...seen];
}

/**
 * Patterns that look like an error code somebody quoted.
 *
 * Three shapes, and no more: a screaming-snake constant (`ERR_SCAN_TIMEOUT`), a lettered code
 * (`E1234`, `SQL0904`) and a hexadecimal one (`0x80070005`). A looser pattern starts matching
 * version numbers and order references, which is worse than matching nothing — an error code is
 * weighted heavily precisely because it is rarely a coincidence.
 */
const ERROR_CODE_PATTERNS = [
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  /\b[A-Z]{1,6}-?\d{3,6}\b/,
  /\b0x[0-9A-Fa-f]{4,8}\b/,
];

/**
 * The first error code in the text, normalised to upper case, or null.
 *
 * Only the first: a log excerpt with six codes in it is not six times as similar to another ticket,
 * and taking the first keeps the value stable when somebody edits the tail of a description.
 */
export function extractErrorCode(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) {
      continue;
    }
    for (const pattern of ERROR_CODE_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        return match[0].toUpperCase();
      }
    }
  }
  return null;
}

/**
 * The coarse bucket a ticket falls in: product, module, version and error code.
 *
 * This is the "fingerprint" of §19.3. It is a *filter*, not a verdict — tickets sharing one are
 * worth comparing, and `similarityScore` decides whether they actually match. Storing it on the row
 * is what keeps the candidate query cheap as the ticket table grows, and it is deliberately a plain
 * readable string rather than a hash so that a support executive looking at the database can see
 * why two tickets were compared.
 */
export function ticketFingerprint(candidate: {
  productId: string | null;
  module: string | null;
  productVersion: string | null;
  errorCode: string | null;
}): string {
  const part = (value: string | null) => (value ? value.trim().toLowerCase() : '-');
  return [
    part(candidate.productId),
    part(candidate.module),
    part(candidate.productVersion),
    part(candidate.errorCode),
  ].join('|');
}

/** One reason a candidate scored. Shown to the person deciding, so every one is a plain phrase. */
export interface SimilaritySignal {
  key: 'module' | 'version' | 'keywords' | 'type' | 'error-code' | 'product';
  detail: string;
}

export interface SimilarityResult {
  score: number;
  signals: readonly SimilaritySignal[];
}

/**
 * The most the shared words between two tickets can be worth, however many there are.
 *
 * Without a ceiling the keyword score is bounded only by `MAX_KEYWORDS`, so two tickets that
 * happen to paste the same stack trace scored up to 40 — swamping the error code at 3 and the
 * module at 2, the two signals this matcher says it trusts most. Two people quoting the same code
 * would then rank below two people quoting the same log boilerplate, which is backwards.
 *
 * Two, so that the ceiling sits at the module's weight and below the error code's: the ordering
 * the doc comment claims is then the ordering the arithmetic produces. Both routes to the
 * threshold `SIMILARITY_MIN_SCORE` describes still reach it — module plus one shared keyword, or
 * version plus two. What no longer reaches it is words alone, which is the case the cap is for.
 */
export const MAX_KEYWORD_SCORE = 2;

/**
 * How strongly two tickets look like the same fault.
 *
 * The weights are the approved prototype's, with one addition. Module is worth 2 because it is the
 * single best predictor; version 1; each shared keyword 1, together no more than
 * `MAX_KEYWORD_SCORE`; the same type half a point as a tie-break. The addition is the error code at
 * 3 — the requirement lists it as a signal, and two tickets quoting the same code are almost never
 * a coincidence, which is exactly the case the keyword score handles worst (one reporter writes
 * prose, the other pastes a log).
 *
 * The score is a rank, not a probability. It is shown as the reasons behind it, never as a
 * percentage nobody could justify.
 */
export function similarityScore(a: SimilarityCandidate, b: SimilarityCandidate): SimilarityResult {
  const signals: SimilaritySignal[] = [];
  let score = 0;

  if (a.errorCode && b.errorCode && a.errorCode === b.errorCode) {
    score += 3;
    signals.push({ key: 'error-code', detail: `error code ${a.errorCode}` });
  }

  if (a.module && b.module && a.module.toLowerCase() === b.module.toLowerCase()) {
    score += 2;
    signals.push({ key: 'module', detail: `module ${a.module}` });
  }

  if (a.productVersion && b.productVersion && a.productVersion === b.productVersion) {
    score += 1;
    signals.push({ key: 'version', detail: `version ${a.productVersion}` });
  }

  const theirs = new Set(b.keywords);
  const overlap = a.keywords.filter((word) => theirs.has(word));
  if (overlap.length > 0) {
    score += Math.min(overlap.length, MAX_KEYWORD_SCORE);
    signals.push({ key: 'keywords', detail: `keywords: ${overlap.slice(0, 3).join(', ')}` });
  }

  if (a.type === b.type) {
    score += 0.5;
    signals.push({ key: 'type', detail: 'same ticket type' });
  }

  if (a.productId && b.productId && a.productId === b.productId) {
    // No score: the candidate query already restricts to one product or project, so this would be
    // a constant added to everything. It is recorded because the person deciding should be able to
    // see it was checked.
    signals.push({ key: 'product', detail: 'same product' });
  }

  return { score, signals };
}

/**
 * The score at and above which a candidate is worth showing.
 *
 * Three is the prototype's threshold and it is the sum of the two commonest genuine matches: the
 * same module plus one shared keyword, or the same version plus two. Below that the suggestions
 * are noise, and a suggestion nobody trusts is worse than none — people stop reading the panel.
 */
export const SIMILARITY_MIN_SCORE = 3;

/** How many suggestions a ticket shows. The approved link dialog lists four. */
export const SIMILARITY_MAX_RESULTS = 5;

/**
 * Ranks candidates against one ticket.
 *
 * Callers pass a pre-filtered list — same organization, same project or product, not cancelled,
 * excluding the ticket itself. That filtering is a query, and doing it here would mean this
 * function had to be told about soft deletes and tenancy, which are not its business.
 */
export function rankSimilar(
  subject: SimilarityCandidate,
  candidates: readonly SimilarityCandidate[],
  options: { minScore?: number; limit?: number } = {},
): { candidate: SimilarityCandidate; score: number; signals: readonly SimilaritySignal[] }[] {
  const minScore = options.minScore ?? SIMILARITY_MIN_SCORE;
  const limit = options.limit ?? SIMILARITY_MAX_RESULTS;

  return candidates
    .filter((candidate) => candidate.ticketId !== subject.ticketId)
    .map((candidate) => ({ candidate, ...similarityScore(subject, candidate) }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.candidate.ticketId.localeCompare(b.candidate.ticketId))
    .slice(0, limit);
}

/**
 * What was decided about a suggestion.
 *
 * `DISMISSED` is stored rather than deleted so the same pair is not suggested again next week, and
 * so a manager can see that somebody looked. `LINKED` records that the tickets were joined; which
 * problem they were joined to lives on the link row, not here.
 */
export const SIMILARITY_DECISION = {
  PENDING: 'PENDING',
  LINKED: 'LINKED',
  DISMISSED: 'DISMISSED',
} as const;

export type SimilarityDecision = (typeof SIMILARITY_DECISION)[keyof typeof SIMILARITY_DECISION];

export const SIMILARITY_DECISION_LABELS: Record<SimilarityDecision, string> = {
  PENDING: 'Suggested',
  LINKED: 'Linked',
  DISMISSED: 'Dismissed',
};

/** How the recurring-issues dashboard groups tickets. The four the approved screen offers. */
export const RECURRING_GROUP_BY = {
  PRODUCT: 'product',
  MODULE: 'module',
  VERSION: 'version',
  SEVERITY: 'severity',
} as const;

export type RecurringGroupBy = (typeof RECURRING_GROUP_BY)[keyof typeof RECURRING_GROUP_BY];

export const RECURRING_GROUP_BY_LABELS: Record<RecurringGroupBy, string> = {
  product: 'Product',
  module: 'Module',
  version: 'Version',
  severity: 'Severity',
};
