import { Spinner } from '@ashniva/ui';
import { Navigate, Outlet, useLocation } from 'react-router';

import { homePathFor, isClientSession, useSession } from './session-context';

export type Audience = 'internal' | 'client';

/**
 * Route guard. Anonymous users go to /login (remembering where they were); a client landing on
 * the internal shell (or the reverse) is sent to their own home. Security still lives in the
 * API — this only keeps people on screens that make sense for them.
 */
export function RequireAuth({ audience }: { audience: Audience }) {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Spinner label="Restoring your session" />
      </div>
    );
  }
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  const isClient = isClientSession(session.user);
  if ((audience === 'client') !== isClient) {
    return <Navigate to={homePathFor(session.user)} replace />;
  }
  return <Outlet />;
}
