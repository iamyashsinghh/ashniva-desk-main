import Constants from 'expo-constants';

/**
 * Runtime configuration.
 *
 * Read from `app.json`'s `extra` block through `expo-constants`, so a build can point at a
 * different API without a code change. Nothing secret goes here: everything in `extra` is
 * embedded in the shipped bundle and readable by anyone who has the app.
 */

interface MobileEnv {
  /** Base URL of the API, including the version prefix. */
  apiBaseUrl: string;
  /** How long a request waits before it is abandoned, in milliseconds. */
  requestTimeoutMs: number;
  /** When true, screens show a banner saying the API is a local development server. */
  isDevelopment: boolean;
}

const DEFAULTS = {
  apiBaseUrl: 'https://desk.ashniva.com/api/v1',
  requestTimeoutMs: 20_000,
} as const;

function readExtra(): Record<string, unknown> {
  const extra = Constants.expoConfig?.extra;
  return typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>) : {};
}

function stringOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/$/, '') : fallback;
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

const extra = readExtra();
const apiBaseUrl = stringOf(extra.apiBaseUrl, DEFAULTS.apiBaseUrl);

export const mobileEnv: MobileEnv = {
  apiBaseUrl,
  requestTimeoutMs: numberOf(extra.requestTimeoutMs, DEFAULTS.requestTimeoutMs),
  // A localhost or private-range API is a developer's machine, and saying so on screen saves
  // somebody wondering why their production data is missing.
  isDevelopment: /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(apiBaseUrl),
};
