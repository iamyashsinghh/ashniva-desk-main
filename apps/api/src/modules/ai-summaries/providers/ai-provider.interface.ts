/**
 * What the summary module needs from a text-generation provider.
 *
 * The whole point of this seam: nothing above it names a vendor. `AiGenerationService` builds a
 * prompt, calls `complete`, and validates what comes back. It does not know whether that went to
 * a hosted API, a model on the same machine, or the mock. Swapping providers is configuration,
 * not a code change, and a summary generated on one provider can be regenerated on another with
 * the run history saying which produced what.
 */

export interface AiCompletionRequest {
  /** The instruction section. Contains no user-written text. */
  system: string;
  /** The data section. Contains fenced, sanitised source records. */
  user: string;
  /** Milliseconds after which the call is abandoned. */
  timeoutMs: number;
}

export interface AiCompletionResult {
  /** The raw text the provider returned, unparsed. */
  text: string;
  /** What the provider reported it used, when it reports anything. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** The model that actually served the call, when the provider names one. */
  model: string | null;
}

/** Non-secret provider configuration, as stored on the integration connection. */
export type AiProviderSettings = Record<string, string | number | boolean | null>;

export interface AiCompletionProvider {
  /** A short, stable name, recorded on every run. Not a vendor's marketing name. */
  readonly name: string;

  /**
   * Whether this provider can be used with the given settings and credential.
   *
   * A provider that is not configured is reported as unavailable rather than failing on the first
   * generation, so the settings screen can say so before anyone waits for a queue job.
   */
  isConfigured(settings: AiProviderSettings, credential: string | null): boolean;

  /**
   * Generates text.
   *
   * Must throw on failure rather than returning an empty result, so `classifyAiError` can decide
   * whether a retry is worth making. Must never put the credential into the error it throws.
   */
  complete(
    request: AiCompletionRequest,
    settings: AiProviderSettings,
    credential: string | null,
  ): Promise<AiCompletionResult>;
}

/** Injection token for the array of registered providers. */
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
