import { DEFAULT_BRANDING, brandingSchema, type Branding } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';

/**
 * The tenant's branding.
 *
 * `GET /branding` is public, so this runs before anyone has signed in and the sign-in screen is
 * painted in the tenant's colour rather than a placeholder. The answer is parsed rather than
 * trusted: the accent colour is written straight into the theme, and a value that is not a
 * `#rrggbb` string would silently make every button transparent.
 *
 * Anything unusable — an unreachable API, an older deployment, a colour that does not parse —
 * falls back to `DEFAULT_BRANDING`, the same approved default the web app uses. The app never
 * renders unstyled while it waits.
 */
export function useBranding(): Branding {
  const query = useResource<unknown>(['branding'], '/branding');

  return useMemo(() => {
    const parsed = brandingSchema.safeParse(query.data);
    return parsed.success ? parsed.data : DEFAULT_BRANDING;
  }, [query.data]);
}
