import { Screen } from '../../shared/components/primitives';
import { LoadingState } from '../../shared/components/states';
import { isClientUser } from '../auth/audience';
import { useSession } from '../auth/SessionProvider';
import {
  InternalTicketDetail,
  type InternalTicketDetailProps,
} from './ticket-detail/InternalTicketDetail';
import { PortalTicketDetail } from './ticket-detail/PortalTicketDetail';

/**
 * One ticket. A client reads it through the portal endpoint, which carries only what a client may
 * see; everybody else gets the staff view with SLA, routing, internal notes and the workflow.
 *
 * Nothing is requested until the session says who this is: guessing "staff" for a moment would
 * send a client's first request to the internal endpoint.
 */
export function TicketDetailScreen(props: InternalTicketDetailProps) {
  const { user } = useSession();
  if (!user) {
    return (
      <Screen>
        <LoadingState label="Loading the ticket" />
      </Screen>
    );
  }
  if (isClientUser(user)) {
    return <PortalTicketDetail ticketId={props.ticketId} />;
  }
  return <InternalTicketDetail {...props} />;
}
