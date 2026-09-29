import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `app.json` is the app; this only adds what differs between a developer's machine and a build.
 *
 * `extra.apiBaseUrl` in `app.json` is whatever a developer points Expo Go at — usually their own
 * machine. Each EAS profile in `eas.json` sets `ASHNIVA_API_BASE_URL`, so an installable build
 * never ships talking to somebody's laptop. Unset, `app.json` wins, and without either the app
 * falls back to production (`src/config/env.ts`).
 *
 * Android push needs Firebase's `google-services.json`. It is kept out of git, so a cloud build
 * gets it from the EAS file variable `GOOGLE_SERVICES_JSON`; a local build uses the file beside
 * this one. Without either the app still builds, and alerts only arrive while it is open.
 */
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const apiBaseUrl = process.env.ASHNIVA_API_BASE_URL?.trim();
  const localGoogleServices = join(projectRoot, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync(localGoogleServices) ? './google-services.json' : undefined);
  return {
    ...config,
    name: config.name ?? 'Ashniva Desk',
    slug: config.slug ?? 'ashniva-desk',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(apiBaseUrl ? { apiBaseUrl } : {}) },
  };
};
