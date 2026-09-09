/**
 * Making user-written text safe to put in a prompt.
 *
 * Every source a summary is grounded in — a task title, a work-log note, a ticket reply — was
 * typed by a person, and one of those people may be a client. So all of it is untrusted input,
 * and the prompt is an interpreter: the same problem as SQL, with a worse parser.
 *
 * Three things happen here, in order of how much they are relied on:
 *
 * 1. The text is escaped so it cannot end the block it is placed in. `prompt-builder.ts` puts
 *    every source inside a fenced block, and this is what makes that fence hold.
 * 2. Control characters and zero-width characters are removed, because they are invisible in a
 *    review screen and are a standard way to smuggle an instruction past a human reader.
 * 3. Text that reads like an instruction is *flagged*, not removed. Removal would silently change
 *    what a record says; flagging puts it in front of the reviewer, who is the actual control.
 *
 * None of this is treated as sufficient on its own. The real guarantee is downstream: a client
 * never sees generated text until a person approves it, and `output-guard.ts` checks the client
 * text against the internal-only sources regardless of what the model was asked to do.
 */

/** The longest a single source contributes. Long enough for a real note, short enough to bound. */
export const MAX_SOURCE_LENGTH = 2000;

/**
 * Phrases that, in a task description, are far more likely to be an attempt to redirect the model
 * than a genuine sentence about the work. Matched case-insensitively, whole-phrase.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(everything|all)\s+(you|above|before)/i,
  /\byou\s+are\s+now\s+(a|an)\b/i,
  /\bsystem\s*(prompt|message)\s*[:=]/i,
  /\b(new|updated|revised)\s+instructions?\s*[:=]/i,
  /\bact\s+as\s+(a|an|the)\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\breveal\s+(your|the)\s+(prompt|instructions?|system)/i,
  /\b(print|output|repeat|show)\s+(your|the)\s+(prompt|instructions?|system\s*message)/i,
  /\bdo\s+not\s+(follow|obey)\s+(the\s+)?(rules?|instructions?)/i,
  /<\s*\/?\s*(system|instructions?|prompt)\s*>/i,
];

/** Zero-width and bidi-control characters: invisible on screen, meaningful to a tokeniser. */
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff]/g;

/** C0 and C1 control characters, keeping newline and tab. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** The fence `prompt-builder.ts` wraps every source in. Escaped so text cannot close it. */
export const SOURCE_FENCE = '<<<';
export const SOURCE_FENCE_END = '>>>';

export interface SanitisedText {
  /** The text as it will appear in the prompt. */
  text: string;
  /** True when the original looked like an attempt to give the model instructions. */
  flagged: boolean;
  /** True when the text was shortened to fit. */
  truncated: boolean;
}

/**
 * Cleans one piece of user-written text.
 *
 * Returns the flag rather than acting on it: what to do about a suspicious source is a decision
 * for the caller, who knows whether this is a client-visible summary or an internal one.
 */
export function sanitiseSourceText(raw: string | null | undefined): SanitisedText {
  const input = (raw ?? '').replace(INVISIBLE, '').replace(CONTROL, ' ');
  const flagged = INJECTION_PATTERNS.some((pattern) => pattern.test(input));

  // Break the fence rather than escaping it: nothing downstream needs the original delimiters
  // back, and a sequence that cannot be reassembled cannot be used to close the block early.
  let text = input
    .replaceAll(SOURCE_FENCE, '<·<·<')
    .replaceAll(SOURCE_FENCE_END, '>·>·>')
    .replaceAll('```', "'''")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const truncated = text.length > MAX_SOURCE_LENGTH;
  if (truncated) {
    text = `${text.slice(0, MAX_SOURCE_LENGTH)}…`;
  }

  return { text, flagged, truncated };
}

/** True when any of these sources looked like an injection attempt. */
export function anyFlagged(sources: readonly SanitisedText[]): boolean {
  return sources.some((source) => source.flagged);
}
