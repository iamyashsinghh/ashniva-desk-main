import { z } from 'zod';

/**
 * Every API error response uses this shape (see apps/api common/filters).
 * `details` carries validation issues; `requestId` matches the server log line.
 */
export const apiErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  details: z.array(z.object({ field: z.string().optional(), message: z.string() })).optional(),
  requestId: z.string().optional(),
  timestamp: z.string(),
  path: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export type ApiErrorDetail = NonNullable<ApiErrorResponse['details']>[number];
