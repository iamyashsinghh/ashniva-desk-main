import { CreateTicketPage } from '../../tickets/pages/CreateTicketPage';

/**
 * Raising a ticket is the same form for clients and staff; CreateTicketPage already switches to
 * the portal endpoint and portal project list when the session is a client session.
 */
export function PortalRaiseTicketPage() {
  return <CreateTicketPage />;
}
