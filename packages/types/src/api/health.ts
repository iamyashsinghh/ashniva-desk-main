import { z } from 'zod';

export const HEALTH_STATUS = {
  UP: 'up',
  DOWN: 'down',
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

export const healthComponentSchema = z.object({
  status: z.enum([HEALTH_STATUS.UP, HEALTH_STATUS.DOWN]),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const healthResponseSchema = z.object({
  status: z.enum([HEALTH_STATUS.UP, HEALTH_STATUS.DOWN]),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  components: z.object({
    database: healthComponentSchema,
    redis: healthComponentSchema,
    storage: healthComponentSchema,
    /**
     * Whether the scheduled background jobs are actually registered.
     *
     * Down means at least one repeatable job is not running: no SLA monitor, no notification
     * delivery, no billing sweep — a deployment that serves every request correctly and quietly
     * does none of its background work. That is a readiness failure, and it used to be invisible.
     */
    queues: healthComponentSchema,
    /** Whether Socket.IO is attached, and whether emits reach the other instances. */
    realtime: healthComponentSchema,
  }),
});

export type HealthComponent = z.infer<typeof healthComponentSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
