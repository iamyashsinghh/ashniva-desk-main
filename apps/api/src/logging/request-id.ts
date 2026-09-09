import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** pino-http stores the generated id on request.id. */
export function getRequestId(request: Request): string | undefined {
  const id = (request as Request & { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}
