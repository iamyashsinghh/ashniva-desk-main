import type { PortalHome, SessionUser } from '@ashniva/types';

import { useResource } from '../../shared/api/queries';
import { isProviderUser } from '../auth/audience';

/**
 * How many approvals are sitting with a client, for the badge on the Home row.
 *
 * Deliberately additive. Home is the screen that has to paint on a cold start with no network, so
 * this never gates it: there is no loading state, no error state and no retry button — a failed
 * or slow request simply leaves the badge off, and every row is still there and still tappable.
 *
 * Only asked for a client. `GET /portal/home` refuses a provider, so asking on their behalf would
 * put a guaranteed 403 in the query cache of every internal user who opened the app.
 *
 * There is no equivalent for the provider. The count that would sit on their Approvals row comes
 * from a dashboard endpoint per role, and one more request on the app's first screen for a number
 * that is one tap away is not worth what it costs on a cold radio.
 */
export function useClientWaiting(user: SessionUser | null): {
  pendingApprovals: number | undefined;
  refresh: () => void;
} {
  const enabled = Boolean(user) && !isProviderUser(user);
  const query = useResource<PortalHome>(['portal', 'home'], '/portal/home', { enabled });

  return {
    pendingApprovals: query.data?.kpis.pendingApprovals,
    refresh: () => {
      if (enabled) {
        void query.refetch();
      }
    },
  };
}
