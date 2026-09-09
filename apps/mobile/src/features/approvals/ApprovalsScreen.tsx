import { Screen } from '../../shared/components/primitives';
import { LoadingState } from '../../shared/components/states';
import { useSession } from '../auth/SessionProvider';
import { isProviderUser } from '../auth/audience';
import { ClientApprovalDetailScreen } from './ClientApprovalDetailScreen';
import { ClientApprovalsScreen } from './ClientApprovalsScreen';
import { InternalApprovalDetailScreen } from './InternalApprovalDetailScreen';
import { InternalApprovalsScreen } from './InternalApprovalsScreen';

/**
 * One route, two audiences.
 *
 * The provider and the client each have their own approvals endpoint returning a deliberately
 * different shape — the client's is built by an allow-list mapper with no internal notes and no
 * requester email in it — so there are two screens rather than one with conditionals in it, and
 * no possibility of a field crossing the line because a branch was wrong.
 *
 * `isProviderUser` only picks the door. Each service asserts the caller's side before it queries
 * anything, so a wrong answer here is a 403 rendered as a sentence, not a leak.
 *
 * Nothing is drawn until the session is known. Treating "not loaded yet" as "a client" would send
 * a provider's phone to the portal endpoint for one render — a guaranteed 403, cached, on a
 * screen that then swaps under them.
 */
export function ApprovalsScreen({ onOpen }: { onOpen: (approvalId: string) => void }) {
  const { user } = useSession();

  if (!user) {
    return <Waiting />;
  }
  return isProviderUser(user) ? (
    <InternalApprovalsScreen onOpen={onOpen} />
  ) : (
    <ClientApprovalsScreen onOpen={onOpen} />
  );
}

export function ApprovalDetailScreen({ approvalId }: { approvalId: string }) {
  const { user } = useSession();

  if (!user) {
    return <Waiting />;
  }
  return isProviderUser(user) ? (
    <InternalApprovalDetailScreen approvalId={approvalId} />
  ) : (
    <ClientApprovalDetailScreen approvalId={approvalId} />
  );
}

function Waiting() {
  return (
    <Screen>
      <LoadingState />
    </Screen>
  );
}
