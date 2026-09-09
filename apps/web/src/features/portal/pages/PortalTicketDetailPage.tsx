import { PRIORITY_LABELS, TICKET_TYPE_LABELS, type PortalTicketDetail } from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  PageHeader,
  PriorityDot,
  Textarea,
  Toolbar,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { DetailSkeleton } from '../../../shared/components/LoadingSkeletons';
import { QueryState } from '../../../shared/components/QueryState';
import { ClientStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useCurrentUser } from '../../auth/session-context';
import { SlaStatusPill } from '../../../shared/components/StatusPills';
import { describeRemaining } from '../../sla/sla-format';
import { FileList } from '../../files/components/FileList';
import { CommentRow } from '../../tasks/components/TaskComments';
import { usePortalTicketMutations, usePortalTicketQuery } from '../api';
import { PortalReopenModal } from '../components/PortalReopenModal';

import '../portal.css';

/** Client ticket detail: the public thread, resolution, files, confirm-close and reopen. */
export function PortalTicketDetailPage() {
  const { id } = useParams();
  const query = usePortalTicketQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      loadingFallback={<DetailSkeleton label="this ticket" />}
    >
      {query.data ? <TicketBody ticket={query.data} /> : null}
    </QueryState>
  );
}

function TicketBody({ ticket }: { ticket: PortalTicketDetail }) {
  const user = useCurrentUser();
  const { reply, close } = usePortalTicketMutations(ticket.id);
  const [body, setBody] = useState('');
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const isOpen = ticket.canReply;

  async function send() {
    setError(undefined);
    try {
      await reply.mutateAsync({ body: body.trim() });
      setBody('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="detail-page">
      <PageHeader
        breadcrumbs={[
          { key: 'tickets', label: 'Tickets', href: '/portal/tickets' },
          { key: 'ticket', label: ticket.key },
        ]}
        renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
        title={ticket.title}
        subtitle={
          <Toolbar aria-label="Ticket status">
            <ClientStatusPill status={ticket.status} />
            <PriorityDot priority={ticket.priority} showLabel />
            <span>{TICKET_TYPE_LABELS[ticket.type]}</span>
            {ticket.needsYourAction ? <Badge tone="warning">Needs you</Badge> : null}
          </Toolbar>
        }
        actions={
          <>
            {ticket.canClose ? (
              <Button
                variant="primary"
                loading={close.isPending}
                onClick={() =>
                  void close.mutateAsync().catch((cause) => setError(errorMessage(cause)))
                }
              >
                Confirm &amp; close
              </Button>
            ) : null}
            {ticket.canReopen ? (
              <Button variant="danger" onClick={() => setReopening(true)}>
                Reopen
              </Button>
            ) : null}
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card title="What you reported">
            <p className="prose">{ticket.description}</p>
            {ticket.impact ? (
              <DescriptionList
                items={[{ key: 'impact', term: 'Impact', description: ticket.impact }]}
              />
            ) : null}
          </Card>
          {ticket.resolution ? (
            <Card title="Resolution" headerAddon={<Badge tone="success">From your team</Badge>}>
              <p className="prose">{ticket.resolution}</p>
              {ticket.canClose ? (
                <p className="actions-card__hint">
                  If this fixes the problem, confirm and close the ticket. If not, reopen it and
                  tell us what is still wrong.
                </p>
              ) : null}
            </Card>
          ) : null}
          <Card title="Conversation">
            <div className="comment-list">
              {ticket.replies.length === 0 ? (
                <EmptyState title="No replies yet" />
              ) : (
                ticket.replies.map((entry) => <CommentRow key={entry.id} comment={entry} />)
              )}
            </div>
            <div className="composer portal-ticket__composer">
              <Textarea
                rows={3}
                aria-label="Reply"
                placeholder={
                  isOpen ? 'Add details or answer a question…' : 'Reopen the ticket to reply.'
                }
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={!isOpen}
              />
              <div className="composer__row">
                <span className="actions-card__hint">Your support desk will see this.</span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={reply.isPending}
                  disabled={!isOpen || body.trim().length === 0}
                  disabledReason={isOpen ? 'Type a message first' : 'This ticket is resolved'}
                  onClick={() => void send()}
                >
                  Send reply
                </Button>
              </div>
            </div>
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Details">
            <DescriptionList items={detailItems(ticket)} />
          </Card>
          <Card title="Attachments">
            <FileList
              files={ticket.files}
              parent={{ ticketId: ticket.id }}
              canUpload={isOpen}
              canRemove={(file) => isOpen && file.uploadedBy.id === user.id}
            />
          </Card>
        </div>
      </div>
      {reopening ? (
        <PortalReopenModal ticketId={ticket.id} onClose={() => setReopening(false)} />
      ) : null}
    </div>
  );
}

/**
 * The Details panel's rows.
 *
 * A built array because three of the seven are conditional — and because the SLA row carries a
 * pill and a deadline, which as a hand-written `<dd>` needed an inline flex row to hold together.
 */
function detailItems(ticket: PortalTicketDetail): DescriptionItem[] {
  const items: DescriptionItem[] = [
    { key: 'ticket', term: 'Ticket', description: ticket.key },
    {
      key: 'project',
      term: 'Project',
      description: ticket.project ? (
        <Link to={`/portal/projects/${ticket.project.id}`}>{ticket.project.name}</Link>
      ) : (
        'General'
      ),
    },
    { key: 'priority', term: 'Priority', description: PRIORITY_LABELS[ticket.priority] },
    { key: 'raised-by', term: 'Raised by', description: ticket.requester.name },
    { key: 'raised', term: 'Raised', description: formatDateTime(ticket.createdAt) },
    {
      key: 'last-activity',
      term: 'Last activity',
      description: formatDateTime(ticket.updatedAt),
    },
  ];
  const { sla } = ticket;
  if (sla) {
    items.push({
      key: 'resolution-target',
      term: 'Resolution target',
      description: (
        <>
          <Toolbar aria-label="Resolution target state">
            <SlaStatusPill status={sla.resolution.status} />
            <span>{describeRemaining(sla.resolution)}</span>
          </Toolbar>
          {sla.resolution.dueAt ? (
            <div className="muted">Due {formatDateTime(sla.resolution.dueAt)}</div>
          ) : null}
        </>
      ),
    });
  }
  if (ticket.resolvedAt) {
    items.push({
      key: 'resolved',
      term: 'Resolved',
      description: formatDateTime(ticket.resolvedAt),
    });
  }
  return items;
}
