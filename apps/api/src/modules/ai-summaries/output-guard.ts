/**
 * Checking what came back.
 *
 * Two jobs, and the second is the one that matters.
 *
 * **Parsing.** The response must be JSON of the shape the prompt asked for. Anything else — prose,
 * a truncated object, a code fence, the right fields with the wrong types — is a failed run, not a
 * summary that a person then has to notice is wrong. Failing loudly is the point: an unusable
 * response is recorded as `INVALID_RESPONSE` and the summary stays editable.
 *
 * **Leakage.** For a client-facing summary, the text is checked against the internal-only material
 * that existed for the same period. This is a real check rather than a hope: `prepareSources`
 * already withheld internal records from the prompt, and this asserts that the output does not
 * contain them anyway. Belt and braces, because the cost of being wrong is a client reading an
 * internal cost estimate.
 *
 * Neither check trusts the model to have obeyed anything.
 */

export interface StructuredSummary {
  summary: string;
  highlights: string[];
  risks: string[];
  references: string[];
}

export type ParseResult = { ok: true; value: StructuredSummary } | { ok: false; reason: string };

const MAX_FIELD = 8000;
const MAX_LIST = 20;

/**
 * Parses a provider response into the agreed shape.
 *
 * Tolerates a surrounding code fence, leading prose, and an object wrapped in an array, because
 * those are the things a model adds most often and none of them changes the content. Everything
 * else is refused.
 */
export function parseStructuredSummary(raw: string): ParseResult {
  const json = extractJsonObject(raw);
  if (!json) {
    return { ok: false, reason: 'The response did not contain a JSON object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'The response was not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'The response was not a JSON object' };
  }

  const record = parsed as Record<string, unknown>;
  const summary = record.summary;
  if (typeof summary !== 'string') {
    return { ok: false, reason: 'The response had no "summary" string' };
  }
  if (summary.length > MAX_FIELD) {
    return { ok: false, reason: 'The summary was longer than the field allows' };
  }

  const highlights = stringList(record.highlights);
  const risks = stringList(record.risks);
  const references = stringList(record.references);
  if (!highlights || !risks || !references) {
    return { ok: false, reason: 'The response had a list field that was not a list of strings' };
  }

  return {
    ok: true,
    value: {
      summary: summary.trim(),
      highlights: highlights.slice(0, MAX_LIST),
      risks: risks.slice(0, MAX_LIST),
      references: references.slice(0, MAX_LIST),
    },
  };
}

function stringList(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null;
    }
    if (entry.trim()) {
      out.push(entry.trim().slice(0, MAX_FIELD));
    }
  }
  return out;
}

/** Finds the outermost balanced JSON object, ignoring braces inside strings. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

// -----------------------------------------------------------------------------------------------
// Leakage
// -----------------------------------------------------------------------------------------------

export interface LeakageFinding {
  /** What kind of internal material was found. */
  kind: 'internal-text' | 'money' | 'other-client';
  /** The matched fragment, short enough to show a reviewer without repeating the leak. */
  fragment: string;
}

/**
 * A distinctive phrase from an internal record: long enough that a coincidental match is
 * implausible, short enough to survive the model rewording the sentence around it.
 */
const PHRASE_WORDS = 6;
const MIN_PHRASE_LENGTH = 24;

/** Currency amounts, in the formats an estimate or a price is normally written in. */
const MONEY_PATTERNS: readonly RegExp[] = [
  /(?:₹|rs\.?|inr|usd|\$|€|£)\s?\d[\d,]*(?:\.\d+)?/i,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:lakh|lakhs|crore|crores)\b/i,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:rupees|dollars|euros)\b/i,
];

export interface LeakageCheckInput {
  /** The client-facing text about to be stored. */
  text: string;
  /** Text from records that were withheld from the prompt because they are internal. */
  internalTexts: readonly string[];
  /** Names of other clients in the same tenant. A weekly summary must not mention them. */
  otherClientNames: readonly string[];
}

/**
 * Looks for internal material in client-facing text.
 *
 * Returns findings rather than throwing, so the caller decides. Today it has one caller:
 * generation, which refuses to store client text with a finding against it. Text a person types
 * or edits by hand is not checked — they can see what they wrote, and it still needs a second
 * person's approval before a client sees it.
 */
export function findLeakage(input: LeakageCheckInput): LeakageFinding[] {
  const haystack = normalise(input.text);
  const findings: LeakageFinding[] = [];

  for (const internal of input.internalTexts) {
    for (const phrase of distinctivePhrases(internal)) {
      if (haystack.includes(phrase)) {
        findings.push({ kind: 'internal-text', fragment: phrase.slice(0, 60) });
        break;
      }
    }
  }

  for (const pattern of MONEY_PATTERNS) {
    const match = pattern.exec(input.text);
    if (match) {
      findings.push({ kind: 'money', fragment: match[0] });
      break;
    }
  }

  for (const name of input.otherClientNames) {
    const trimmed = name.trim();
    // Two characters is not a name, it is a false positive waiting to happen.
    if (trimmed.length > 2 && haystack.includes(normalise(trimmed))) {
      findings.push({ kind: 'other-client', fragment: trimmed });
    }
  }

  return findings;
}

/** Whitespace and case folded, so a reworded gap does not hide a copied phrase. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Overlapping word windows from an internal text.
 *
 * Windows rather than the whole text: a model that copies half a sentence has still copied it,
 * and comparing whole strings would only catch a verbatim reproduction of the entire record.
 */
export function distinctivePhrases(internal: string): string[] {
  const words = normalise(internal).split(' ').filter(Boolean);
  if (words.length < PHRASE_WORDS) {
    const whole = words.join(' ');
    return whole.length >= MIN_PHRASE_LENGTH ? [whole] : [];
  }
  const phrases: string[] = [];
  for (let i = 0; i + PHRASE_WORDS <= words.length; i += 1) {
    const phrase = words.slice(i, i + PHRASE_WORDS).join(' ');
    if (phrase.length >= MIN_PHRASE_LENGTH) {
      phrases.push(phrase);
    }
  }
  return phrases;
}

/** Renders the structured response as the text that gets stored and reviewed. */
export function renderSummaryText(value: StructuredSummary): string {
  const parts = [value.summary];
  if (value.highlights.length > 0) {
    parts.push('', 'Highlights:', ...value.highlights.map((line) => `- ${line}`));
  }
  if (value.risks.length > 0) {
    parts.push('', 'Risks and blockers:', ...value.risks.map((line) => `- ${line}`));
  }
  if (value.references.length > 0) {
    parts.push('', `References: ${value.references.join(', ')}`);
  }
  return parts.join('\n');
}
