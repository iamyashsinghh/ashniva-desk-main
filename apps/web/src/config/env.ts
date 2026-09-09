import { z } from 'zod';

/**
 * Build-time environment for the web app (Vite exposes only VITE_* variables).
 * Never put secrets here: everything in this file ships to the browser.
 */
const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
});

function readWebEnv() {
  const result = webEnvSchema.safeParse(import.meta.env);
  if (!result.success) {
    throw new Error(`Invalid web environment: ${result.error.message}`);
  }
  return {
    apiBaseUrl: result.data.VITE_API_BASE_URL.replace(/\/$/, ''),
    isDevelopment: import.meta.env.DEV,
  };
}

export const webEnv = readWebEnv();
