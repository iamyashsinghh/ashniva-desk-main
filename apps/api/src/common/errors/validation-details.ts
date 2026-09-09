import type { ApiErrorDetail } from '@ashniva/types';

/**
 * The global ValidationPipe throws BadRequestException with `message: string[]`.
 * Turn that list into structured details; return undefined for any other payload.
 */
export function extractValidationDetails(payload: unknown): ApiErrorDetail[] | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const message = (payload as { message?: unknown }).message;
  if (!Array.isArray(message)) {
    return undefined;
  }
  return message
    .filter((item): item is string => typeof item === 'string')
    .map((text) => ({ field: text.split(' ')[0], message: text }));
}
