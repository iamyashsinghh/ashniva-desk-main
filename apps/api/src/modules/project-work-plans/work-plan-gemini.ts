import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  workPlanAdditionsFromModelJson,
  workPlanFromModelJson,
  type WorkPlanDraftAddition,
  type WorkPlanDraftPhase,
} from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { SafeHttpService } from '../../infrastructure/http/safe-http.service';

const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROMPT = `Analyse this project brief PDF. Return JSON only, in this shape:

{"phases":[{"heading":"Discovery","titles":[{"title":"Kickoff","points":[{"body":"Gather requirements","estimateMinutes":30}]}]}]}

Rules:
- Use only work that is in the PDF. Do not invent a product that is not there.
- Split the work into phases. Each phase has a short heading.
- Under each phase, titles are workstreams (Title 1, Title 2, …).
- Each point is one concrete step: what to do in that title.
- estimateMinutes is how long that step should take (1 to 1440). Prefer 15–120 for ordinary steps.
- 1–12 phases, 1–8 titles per phase, 1–12 points per title.
- Ignore covers, NDAs, billing tables and anything that is not project work.`;

const EXPAND_FAIL = 'The extra work could not be planned. Try again, or add phases by hand.';

export interface ExpandWorkInput {
  prompt: string;
  outline: string;
}

/**
 * Sends an uploaded brief to Gemini and turns the answer into a phase plan.
 *
 * Only runs when GEMINI_API_KEY is set. Tests delete that variable so they never call a live model.
 */
@Injectable()
export class WorkPlanGeminiService {
  private readonly logger = new Logger(WorkPlanGeminiService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly http: SafeHttpService,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.config.gemini.apiKey);
  }

  async analysePdf(pdf: Buffer): Promise<WorkPlanDraftPhase[]> {
    const text = await this.generateJson(
      geminiGenerateBody(pdf),
      'The PDF could not be analysed. Try again, or add phases by hand.',
    );
    const phases = workPlanFromModelJson(text);
    if (phases.length === 0) {
      throw new BadRequestException('The PDF had no project work to divide into phases');
    }
    return phases;
  }

  /**
   * Reads the current summary and the request, then returns new titles attached to an existing
   * phase or a new phase — whichever fits.
   */
  async expandWork(input: ExpandWorkInput): Promise<WorkPlanDraftAddition[]> {
    const text = await this.generateJson(geminiTextGenerateBody(expandPrompt(input)), EXPAND_FAIL);
    const additions = workPlanAdditionsFromModelJson(text);
    if (additions.length === 0) {
      throw new BadRequestException('No related work came back for that request');
    }
    return additions;
  }

  private async generateJson(
    payload: Record<string, unknown>,
    failMessage: string,
  ): Promise<string> {
    const { apiKey, model, timeoutMs } = this.config.gemini;
    if (!apiKey) {
      throw new BadRequestException('PDF analysis is not configured');
    }

    const endpoint = `${GEMINI_GENERATE_URL}/${encodeURIComponent(model)}:generateContent`;
    let response: Response;
    try {
      response = await this.http.fetch(endpoint, {
        method: 'POST',
        timeoutMs,
        maxBytes: 5 * 1024 * 1024,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      this.logger.warn(
        `Gemini request failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new BadRequestException(failMessage);
    }

    const body: unknown = await readJsonBody(response);
    if (!response.ok) {
      this.logger.warn(`Gemini returned ${geminiErrorSummary(response.status, body)}`);
      throw new BadRequestException(failMessage);
    }

    return readGeminiText(body);
  }
}

/** REST JSON for generateContent: camelCase, no thinkingConfig (Gemini 3 rejects thinkingBudget). */
export function geminiGenerateBody(pdf: Buffer): Record<string, unknown> {
  return geminiJsonBody([
    { text: PROMPT },
    { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
  ]);
}

export function geminiTextGenerateBody(prompt: string): Record<string, unknown> {
  return geminiJsonBody([{ text: prompt }]);
}

function geminiJsonBody(parts: unknown[]): Record<string, unknown> {
  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };
}

function expandPrompt(input: ExpandWorkInput): string {
  const outline = input.outline.trim() || '(empty plan)';
  return `You add work to an existing project summary. Read the whole plan first. Decide which phase the request belongs in. If none fits, open a new phase.

Return JSON only:
{"additions":[{"phaseId":"<existing phase id or null>","heading":"Authentication","titles":[{"title":"OTP login","points":[{"body":"Build the OTP screen","estimateMinutes":45}]}]}]}

Rules:
- If the work belongs in an existing phase, set phaseId to that phase's id from the outline. Return only NEW titles for it.
- If it needs its own phase, set phaseId to null and give a short heading.
- Do not repeat titles already on the plan.
- 1–4 titles, 1–8 points each. Each point is one concrete step.
- estimateMinutes is 15–240 for ordinary work.
- Stay related to the request and the existing plan. Do not invent a different product.

Existing plan:
${outline}

Requested work:
${input.prompt}`;
}

export function readGeminiText(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return '';
  }
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return '';
  }
  const content = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }
  return parts
    .filter((part) => {
      if (!part || typeof part !== 'object') {
        return false;
      }
      return (part as { thought?: unknown }).thought !== true;
    })
    .map((part) =>
      typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '',
    )
    .join('')
    .trim();
}

export function geminiErrorSummary(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: unknown; status?: unknown } }).error;
    const message = typeof error?.message === 'string' ? error.message : '';
    const code = typeof error?.status === 'string' ? error.status : '';
    if (message) {
      return `${status}${code ? ` ${code}` : ''}: ${message}`;
    }
  }
  return String(status);
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
