import { envSchema, type Env } from './env.schema';

/**
 * Called by @nestjs/config at startup. Throws a readable error listing every invalid variable.
 */
export function validateEnv(rawEnv: Record<string, unknown>): Env {
  const result = envSchema.safeParse(rawEnv);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}
