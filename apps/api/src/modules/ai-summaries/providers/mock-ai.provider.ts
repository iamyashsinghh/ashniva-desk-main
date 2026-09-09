import { Injectable } from '@nestjs/common';

import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderSettings,
} from './ai-provider.interface';

/**
 * The development and test provider.
 *
 * Selected by `AI_PROVIDER=mock`. It reaches nothing — the automated tests must never contact a
 * real provider, and the local preview should work without anyone holding an account.
 *
 * It is not a stub returning fixed text. It reads the fenced source records out of the prompt and
 * builds a summary from them, so it exercises the same code path a real provider would: the
 * response is parsed, validated, checked for leakage and versioned exactly as if it had come off
 * the wire. A test that asserts "the summary mentions the task" is therefore a real assertion.
 *
 * Deterministic, because a test that produces different text each run is a test nobody trusts.
 */
@Injectable()
export class MockAiProvider implements AiCompletionProvider {
  readonly name = 'mock';

  /** The mock needs no endpoint and no credential; it is always available. */
  isConfigured(): boolean {
    return true;
  }

  complete(
    request: AiCompletionRequest,
    _settings: AiProviderSettings,
    _credential: string | null,
  ): Promise<AiCompletionResult> {
    const records = extractRecords(request.user);
    const period = /^PERIOD: (.+)$/m.exec(request.user)?.[1] ?? 'the period';
    const subject = /^SUBJECT: (.+)$/m.exec(request.user)?.[1] ?? 'the team';

    if (records.length === 0) {
      return Promise.resolve(
        this.result(
          {
            summary: `No recorded activity for ${subject} between ${period}.`,
            highlights: [],
            risks: [],
            references: [],
          },
          request,
        ),
      );
    }

    const summary =
      `${subject} has ${records.length} recorded item${records.length === 1 ? '' : 's'} ` +
      `between ${period}. ${records[0]?.label ?? ''}`.trim();

    return Promise.resolve(
      this.result(
        {
          summary,
          highlights: records.slice(0, 6).map((record) => `${record.label} (${record.reference})`),
          risks: records
            .filter((record) => /blocked|overdue|failed|breach/i.test(record.label))
            .slice(0, 4)
            .map((record) => `${record.label} needs attention (${record.reference})`),
          references: records.map((record) => record.reference),
        },
        request,
      ),
    );
  }

  private result(
    value: { summary: string; highlights: string[]; risks: string[]; references: string[] },
    request: AiCompletionRequest,
  ): AiCompletionResult {
    const text = JSON.stringify(value);
    return {
      text,
      // A rough four-characters-per-token, so the usage screen has something plausible to show
      // in development without pretending to be exact.
      inputTokens: Math.ceil((request.system.length + request.user.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
      model: 'mock-summariser',
    };
  }
}

interface MockRecord {
  reference: string;
  label: string;
}

/**
 * Reads the records back out of the prompt.
 *
 * Matches the format `prompt-builder.ts` writes: `[REFERENCE] KIND on DATE: label`. Anything that
 * does not match that is ignored, which is also what makes the mock a useful check on the builder
 * — if the format drifts, the mock stops finding records and the tests say so.
 */
function extractRecords(user: string): MockRecord[] {
  const out: MockRecord[] = [];
  const pattern = /^\[([A-Z_]+-\d+)\]\s+[A-Z_]+(?:\s+on\s+[\d-]+)?:\s*(.+)$/gm;
  let match = pattern.exec(user);
  while (match) {
    out.push({ reference: match[1] ?? '', label: (match[2] ?? '').trim() });
    match = pattern.exec(user);
  }
  return out;
}
