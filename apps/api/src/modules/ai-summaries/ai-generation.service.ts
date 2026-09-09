import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  AI_GENERATION_STATUS,
  INTEGRATION_PROVIDER,
  isClientFacingSummary,
  type AiSummaryType,
} from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { redactMessage } from '../integrations/redact';
import { classifyAiError, invalidResponseFailure } from './ai-failure';
import { AiSourceCollectorService, type CollectionScope } from './ai-source-collector.service';
import { AiSummariesRepository } from './ai-summaries.repository';
import { ClientTextGuard } from './client-text.guard';
import { parseStructuredSummary, renderSummaryText } from './output-guard';
import { buildPrompt, OUTPUT_VERSION, PROMPT_VERSION } from './prompt-builder';
import { prepareSources, type PreparedSource } from './source-selection';
import { AI_PROVIDERS, type AiCompletionProvider } from './providers/ai-provider.interface';

/**
 * One generation run, end to end.
 *
 * The order below is the design, and it is deliberate:
 *
 * 1. Collect only authorised sources, then drop internal ones for a client-facing summary.
 * 2. Sanitise every piece of user-written text, and record what went into the prompt.
 * 3. Call the provider with a timeout, recording the run before and after.
 * 4. Parse the response. An unparseable answer is a failed run, not a summary.
 * 5. For client-facing text, check it against the internal material that was withheld. If it
 *    contains any, the client text is refused — the internal text is still stored, so the run is
 *    not wasted and a person can see what happened.
 * 6. Mark the output a draft. It stays a draft until a person approves it.
 *
 * Nothing here names a provider. `AI_PROVIDERS` supplies whichever adapter the deployment
 * registered, and the run row records which one it was.
 */

export interface GenerationOutcome {
  ok: boolean;
  status: (typeof AI_GENERATION_STATUS)[keyof typeof AI_GENERATION_STATUS];
  /** Set when the run failed, for the caller to decide whether to re-throw for a retry. */
  retryable: boolean;
  message: string | null;
}

export interface GenerationInput {
  summaryId: string;
  organizationId: string;
  actorUserId: string;
  type: AiSummaryType;
  clientOrganizationId: string | null;
  projectId: string | null;
  subjectUserId: string | null;
  ticketId: string | null;
  subject: string;
  periodStart: Date;
  /** Exclusive. */
  periodEnd: Date;
}

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly repository: AiSummariesRepository,
    private readonly collector: AiSourceCollectorService,
    private readonly integrations: IntegrationsService,
    private readonly clientText: ClientTextGuard,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
    @Inject(AI_PROVIDERS) private readonly providers: AiCompletionProvider[],
  ) {
    this.logger.setContext(AiGenerationService.name);
  }

  /** The registered provider. There is exactly one per deployment, chosen by configuration. */
  private get provider(): AiCompletionProvider | null {
    return this.providers[0] ?? null;
  }

  /** Whether generation is available, without saying anything about the credential. */
  async status(organizationId: string) {
    const provider = this.provider;
    if (!provider) {
      return {
        providerName: 'none',
        configured: false,
        model: null,
        promptVersion: PROMPT_VERSION,
        outputVersion: OUTPUT_VERSION,
      };
    }
    const connection = await this.integrations.channelConfigFor(
      organizationId,
      INTEGRATION_PROVIDER.AI,
    );
    const settings = connection?.settings ?? {};
    return {
      providerName: provider.name,
      configured: provider.isConfigured(settings, connection?.secret ?? null),
      model: typeof settings.model === 'string' ? settings.model : null,
      promptVersion: PROMPT_VERSION,
      outputVersion: OUTPUT_VERSION,
    };
  }

  /**
   * Runs generation for a summary that has already been claimed.
   *
   * Never throws for an ordinary failure: the outcome says what happened and whether a retry is
   * worth making, and the summary is left in a state a person can act on either way.
   */
  async run(input: GenerationInput, attempt: number): Promise<GenerationOutcome> {
    const provider = this.provider;
    if (!provider) {
      return this.fail(input, 'no-provider', 'No AI provider is registered', false);
    }

    const connection = await this.integrations.channelConfigFor(
      input.organizationId,
      INTEGRATION_PROVIDER.AI,
    );
    const settings = connection?.settings ?? {};
    const credential = connection?.secret ?? null;
    if (!provider.isConfigured(settings, credential)) {
      return this.fail(
        input,
        'not-configured',
        'The AI provider is not configured for this organization',
        false,
      );
    }

    const scope: CollectionScope = {
      organizationId: input.organizationId,
      type: input.type,
      projectId: input.projectId,
      subjectUserId: input.subjectUserId,
      ticketId: input.ticketId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    };

    // Collecting and storing the sources happens after the claim, so a failure here would
    // otherwise leave the row in GENERATING with nothing recorded and no way back — GENERATING is
    // terminal by design (see `ai-summary-workflow.ts`), so it has to fail into a state a person
    // can act on.
    let raw: Awaited<ReturnType<typeof this.collector.collect>>;
    let prepared: ReturnType<typeof prepareSources>;
    try {
      raw = await this.collector.collect(scope);
      prepared = prepareSources(input.type, raw);
      await this.storeSources(input.summaryId, prepared.sources);
    } catch (error) {
      const message = redactMessage(error);
      this.logger.warn({ summaryId: input.summaryId, message }, 'Could not gather sources');
      await this.repository.update(input.summaryId, { status: 'GENERATION_FAILED' });
      return {
        ok: false,
        status: AI_GENERATION_STATUS.FAILED,
        retryable: true,
        message,
      };
    }

    if (prepared.sources.length === 0) {
      await this.repository.update(input.summaryId, {
        status: 'DRAFT',
        missingDataNote: prepared.missingDataNote,
        internalContent: null,
        clientContent: null,
      });
      return {
        ok: false,
        status: AI_GENERATION_STATUS.NO_SOURCES,
        retryable: false,
        message: prepared.missingDataNote,
      };
    }

    const clientFacing = isClientFacingSummary(input.type);
    const prompt = buildPrompt({
      type: input.type,
      periodStart: input.periodStart,
      periodEnd: dayBefore(input.periodEnd),
      subject: input.subject,
      sources: prepared.sources,
      clientFacing,
    });

    const run = await this.repository.startRun({
      organizationId: input.organizationId,
      summaryId: input.summaryId,
      status: AI_GENERATION_STATUS.RUNNING,
      providerName: provider.name,
      model: typeof settings.model === 'string' ? settings.model : null,
      promptVersion: prompt.promptVersion,
      outputVersion: prompt.outputVersion,
      attempt,
    });

    const startedAt = Date.now();
    let completion;
    try {
      completion = await provider.complete(
        {
          system: prompt.system,
          user: prompt.user,
          timeoutMs: this.config.ai.timeoutMs,
        },
        settings,
        credential,
      );
    } catch (error) {
      const classified = classifyAiError(error);
      const message = redactMessage(error);
      await this.repository.finishRun(run.id, {
        status: classified.status,
        failureCode: classified.code,
        failureMessage: message,
        latencyMs: Date.now() - startedAt,
        finishedAt: new Date(),
      });
      await this.repository.update(input.summaryId, { status: 'GENERATION_FAILED' });
      this.logger.warn(
        { summaryId: input.summaryId, code: classified.code },
        'AI generation failed',
      );
      return {
        ok: false,
        status: classified.status,
        retryable: classified.retryable,
        message,
      };
    }

    const latencyMs = Date.now() - startedAt;
    const parsed = parseStructuredSummary(completion.text);
    if (!parsed.ok) {
      const classified = invalidResponseFailure();
      await this.repository.finishRun(run.id, {
        status: classified.status,
        failureCode: classified.code,
        // The reason, never the response: a malformed response can still contain source records.
        failureMessage: parsed.reason,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        latencyMs,
        finishedAt: new Date(),
      });
      await this.repository.update(input.summaryId, { status: 'GENERATION_FAILED' });
      return {
        ok: false,
        status: classified.status,
        retryable: false,
        message: parsed.reason,
      };
    }

    const text = renderSummaryText(parsed.value);
    const { clientContent, leakageNote } = clientFacing
      ? await this.clientText.decide(input, text)
      : { clientContent: null, leakageNote: null };

    await this.repository.update(input.summaryId, {
      status: 'DRAFT',
      internalContent: text,
      clientContent,
      isDraftOutput: true,
      missingDataNote: joinNotes(
        prepared.missingDataNote,
        leakageNote,
        flaggedNote(prepared.flagged),
      ),
      version: { increment: 1 },
      providerName: provider.name,
      model: completion.model,
      promptVersion: prompt.promptVersion,
      outputVersion: prompt.outputVersion,
      generatedAt: new Date(),
    });

    await this.repository.finishRun(run.id, {
      status: AI_GENERATION_STATUS.SUCCEEDED,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      latencyMs,
      finishedAt: new Date(),
    });

    return { ok: true, status: AI_GENERATION_STATUS.SUCCEEDED, retryable: false, message: null };
  }

  private async storeSources(summaryId: string, sources: readonly PreparedSource[]) {
    await this.repository.replaceSources(
      summaryId,
      sources.map((source) => ({
        summaryId,
        kind: source.kind,
        refId: source.refId,
        label: source.label,
        promptText: source.promptText || null,
        occurredAt: source.occurredAt,
        clientVisible: source.clientVisible,
        sortOrder: source.sortOrder,
      })),
    );
  }

  /** Records a run that never reached the provider, so the failure is still visible. */
  private async fail(
    input: GenerationInput,
    code: string,
    message: string,
    retryable: boolean,
  ): Promise<GenerationOutcome> {
    const run = await this.repository.startRun({
      organizationId: input.organizationId,
      summaryId: input.summaryId,
      status: AI_GENERATION_STATUS.FAILED,
      providerName: this.provider?.name ?? 'none',
      promptVersion: PROMPT_VERSION,
      outputVersion: OUTPUT_VERSION,
      attempt: 1,
      failureCode: code,
      failureMessage: message,
      finishedAt: new Date(),
    });
    await this.repository.update(input.summaryId, { status: 'GENERATION_FAILED' });
    this.logger.warn({ summaryId: input.summaryId, runId: run.id, code }, message);
    return { ok: false, status: AI_GENERATION_STATUS.FAILED, retryable, message };
  }
}

/** The prompt shows an inclusive period; the queries use an exclusive end. */
function dayBefore(exclusiveEnd: Date): Date {
  const date = new Date(exclusiveEnd);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function flaggedNote(flagged: boolean): string | null {
  return flagged
    ? 'At least one source record contained text that looked like an instruction rather than a description. Read the sources before approving.'
    : null;
}

function joinNotes(...notes: (string | null)[]): string | null {
  const kept = notes.filter((note): note is string => Boolean(note));
  return kept.length > 0 ? kept.join('\n\n') : null;
}
