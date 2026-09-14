import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { workPlanFromModelJson, type WorkPlanDraftPhase } from '@ashniva/types';

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
        body: JSON.stringify(geminiGenerateBody(pdf)),
      });
    } catch (error) {
      this.logger.warn(`Gemini request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new BadRequestException('The PDF could not be analysed. Try again, or add phases by hand.');
    }

    const body: unknown = await readJsonBody(response);
    if (!response.ok) {
      this.logger.warn(`Gemini returned ${geminiErrorSummary(response.status, body)}`);
      throw new BadRequestException('The PDF could not be analysed. Try again, or add phases by hand.');
    }

    const text = readGeminiText(body);
    const phases = workPlanFromModelJson(text);
    if (phases.length === 0) {
      throw new BadRequestException('The PDF had no project work to divide into phases');
    }
    return phases;
  }
}

/** REST JSON for generateContent: camelCase, no thinkingConfig (Gemini 3 rejects thinkingBudget). */
export function geminiGenerateBody(pdf: Buffer): Record<string, unknown> {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };
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
    .map((part) => (typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
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
