import {
  WORK_RELATION_ROLE_LABELS,
  type TicketRelationView,
  type TicketRelationsResponse,
} from '@ashniva/types';
import { Badge, Button, Card, EmptyState } from '@ashniva/ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { TicketStatusPill } from '../../../shared/components/StatusPills';
import { useTicketRelationMutations, useTicketRelationsQuery } from '../api';
import { LinkTicketModal } from './LinkTicketModal';

import '../relations.css';

/**
 * Duplicates and related tickets on the ticket's own screen.
 *
 * The panel shows what the API decided to show and nothing more. A link whose far end the reader
 * may not open arrives with `other: null`, and for a client it does not arrive at all — the filter
 * is the server's, so there is nothing here that could be persuaded to render a title it was not
 * given.
 *
 * The card is hidden entirely when there is nothing to show and nothing the reader could do, so a
 * client's ticket screen does not grow an empty box explaining a feature they cannot use.
 */
export function TicketRelationsPanel({ ticketId }: { ticketId: string }) {
  const query = useTicketRelationsQuery(ticketId);
  const [linking, setLinking] = useState(false);

  if (!query.data || (query.data.relations.length === 0 && !query.data.canLink)) {
    return null;
  }
  return (
    <>
      <Loaded ticketId={ticketId} data={query.data} onLink={() => setLinking(true)} />
      {query.data.canLink ? (
        <LinkTicketModal open={linking} ticketId={ticketId} onClose={() => setLinking(false)} />
      ) : null}
    </>
  );
}

function Loaded({
  ticketId,
  data,
  onLink,
}: {
  ticketId: string;
  data: TicketRelationsResponse;
  onLink: () => void;
}) {
  const { unlink } = useTicketRelationMutations(ticketId);
  return (
    <Card
      title="Duplicates and related tickets"
      headerAddon={
        data.canLink ? (
          <Button size="sm" onClick={onLink}>
            Link a ticket
          </Button>
        ) : null
      }
    >
      {data.relations.length === 0 ? (
        <EmptyState
          title="Nothing linked yet"
          description="Link this ticket to one it duplicates, or to one it belongs with."
        />
      ) : (
        <ul className="relations-panel">
          {data.relations.map((relation) => (
            <li key={relation.id} className="relations-panel__row">
              <RelationRow relation={relation} />
              {data.canLink ? (
                <Button
                  size="sm"
                  loading={unlink.isPending}
                  onClick={() => unlink.mutate(relation.id)}
                  title="Remove the link. Nothing on either ticket changes."
                >
                  Unlink
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {unlink.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(unlink.error)}
        </p>
      ) : null}
    </Card>
  );
}

function RelationRow({ relation }: { relation: TicketRelationView }) {
  return (
    <div className="relations-panel__facts">
      <Badge tone={relation.role === 'DUPLICATE' ? 'warning' : 'neutral'}>
        {WORK_RELATION_ROLE_LABELS[relation.role]}
      </Badge>
      {relation.other ? (
        <>
          <Link to={`/tickets/${relation.other.id}`}>{relation.other.key}</Link>
          <span>{relation.other.title}</span>
          <TicketStatusPill status={relation.other.status} />
          <span className="relations-panel__meta">{relation.other.clientOrganization.name}</span>
        </>
      ) : (
        // The API gave no id and no title. Saying so is better than an empty row, and it is all
        // this reader is entitled to know.
        <span className="relations-panel__meta">A ticket you do not have access to</span>
      )}
      {relation.note ? <span className="relations-panel__meta">· {relation.note}</span> : null}
    </div>
  );
}
