import type { AiProviderSettings } from './ai-provider.interface';

/**
 * The non-secret configuration an HTTP text-generation provider needs.
 *
 * Everything here is a setting rather than code, which is what keeps the module provider-neutral:
 * the endpoint, the model, the header the credential goes in, and the paths to read the response
 * from. Pointing this at a different vendor is filling in a form, not editing a file.
 *
 * The credential is never in here. It lives encrypted on the connection and reaches the provider
 * as a separate argument.
 */
export interface AiHttpConfig {
  /** Absolute HTTPS endpoint that accepts the completion request. */
  endpoint: string;
  /** Model identifier sent in the body. */
  model: string;
  /** Header the credential goes in. Defaults to Authorization. */
  authHeader: string;
  /** Prefix put before the credential in that header, e.g. "Bearer ". */
  authPrefix: string;
  /** Dotted path to the generated text in the response body. */
  textPath: string;
  /** Dotted paths to the token counts, when the provider reports them. */
  inputTokensPath: string | null;
  outputTokensPath: string | null;
  /** Upper bound on generated length, passed through to the provider. */
  maxOutputTokens: number;
}

const DEFAULTS = {
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  textPath: 'choices.0.message.content',
  inputTokensPath: 'usage.prompt_tokens',
  outputTokensPath: 'usage.completion_tokens',
  maxOutputTokens: 1500,
} as const;

/**
 * Reads the settings, returning null when the connection is not usable.
 *
 * A plain-HTTP endpoint is refused rather than allowed with a warning: the prompt contains
 * customer records, and sending those over an unencrypted connection is not a choice a settings
 * screen should be able to make.
 */
export function readAiHttpConfig(settings: AiProviderSettings): AiHttpConfig | null {
  const endpoint = stringOf(settings.endpoint);
  const model = stringOf(settings.model);
  if (!endpoint || !model) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') {
    return null;
  }

  return {
    endpoint,
    model,
    authHeader: stringOf(settings.authHeader) ?? DEFAULTS.authHeader,
    authPrefix: stringOf(settings.authPrefix) ?? DEFAULTS.authPrefix,
    textPath: stringOf(settings.textPath) ?? DEFAULTS.textPath,
    inputTokensPath: stringOf(settings.inputTokensPath) ?? DEFAULTS.inputTokensPath,
    outputTokensPath: stringOf(settings.outputTokensPath) ?? DEFAULTS.outputTokensPath,
    maxOutputTokens: numberOf(settings.maxOutputTokens) ?? DEFAULTS.maxOutputTokens,
  };
}

/**
 * Follows a dotted path through a parsed JSON body.
 *
 * Numeric segments index arrays, so `choices.0.message.content` works without the caller writing
 * a bespoke reader for each provider's response shape.
 */
export function readPath(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Reads a path that should hold text, tolerating a provider that returns an array of parts. */
export function readTextAt(body: unknown, path: string): string | null {
  const value = readPath(body, path);
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const joined = value.map(partText).join('');
    return joined || null;
  }
  return null;
}

/** One entry of an array-of-parts response: a plain string, or an object with a `text` field. */
function partText(part: unknown): string {
  if (typeof part === 'string') {
    return part;
  }
  if (typeof part === 'object' && part !== null) {
    const text = (part as { text?: unknown }).text;
    return typeof text === 'string' ? text : '';
  }
  return '';
}

export function readNumberAt(body: unknown, path: string | null): number | null {
  if (!path) {
    return null;
  }
  const value = readPath(body, path);
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}
