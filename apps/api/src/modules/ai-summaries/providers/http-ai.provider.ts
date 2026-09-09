import { Injectable } from '@nestjs/common';

import { SafeHttpService } from '../../../infrastructure/http/safe-http.service';
import { redactMessage } from '../../integrations/redact';
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderSettings,
} from './ai-provider.interface';
import { readAiHttpConfig, readNumberAt, readTextAt } from './ai-settings';

/**
 * A text-generation provider over HTTP, driven entirely by settings.
 *
 * There is no vendor here. The endpoint, the model, the header the credential goes in and the
 * paths to read the answer out of are all configuration, so this one adapter serves any provider
 * that accepts a JSON body and returns JSON — which is all of the common ones, and a locally
 * hosted model behind a small shim.
 *
 * The body it sends is the shape most providers accept: a model, a list of role-tagged messages,
 * and a length cap. A provider that wants something different is a second adapter, not a branch
 * in this one.
 */
@Injectable()
export class HttpAiProvider implements AiCompletionProvider {
  readonly name = 'http';

  constructor(private readonly http: SafeHttpService) {}

  isConfigured(settings: AiProviderSettings, credential: string | null): boolean {
    return readAiHttpConfig(settings) !== null && Boolean(credential);
  }

  async complete(
    request: AiCompletionRequest,
    settings: AiProviderSettings,
    credential: string | null,
  ): Promise<AiCompletionResult> {
    const config = readAiHttpConfig(settings);
    if (!config) {
      throw new Error('The AI connection is missing an HTTPS endpoint or a model');
    }

    try {
      // The endpoint is operator-supplied, so it goes through the shared guard — which also owns
      // the timeout, rather than this method relying on the platform default of several minutes.
      const response = await this.http.fetch(config.endpoint, {
        method: 'POST',
        timeoutMs: request.timeoutMs,
        headers: {
          'content-type': 'application/json',
          ...(credential ? { [config.authHeader]: `${config.authPrefix}${credential}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxOutputTokens,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });

      if (!response.ok) {
        // The status is what the classifier reads; the body is not attached, because a provider
        // error body can echo the request — which contains customer records.
        throw Object.assign(new Error(`The AI provider returned ${response.status}`), {
          status: response.status,
        });
      }

      const body: unknown = await response.json();
      const text = readTextAt(body, config.textPath);
      if (!text) {
        throw new Error('The AI provider returned no text at the configured path');
      }

      return {
        text,
        inputTokens: readNumberAt(body, config.inputTokensPath),
        outputTokens: readNumberAt(body, config.outputTokensPath),
        model: config.model,
      };
    } catch (error) {
      // Re-thrown with a redacted message but the original properties, so the classifier can
      // still read the status or the network code off it.
      if (typeof error === 'object' && error !== null) {
        const wrapped = new Error(redactMessage(error));
        Object.assign(wrapped, {
          name: (error as Error).name,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          cause: (error as { cause?: unknown }).cause,
        });
        throw wrapped;
      }
      throw new Error(redactMessage(error));
    }
  }
}
