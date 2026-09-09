import {
  PERMISSIONS,
  PRIORITY_LABELS,
  TICKET_TYPE_LABELS,
  type TicketDetail,
} from '@ashniva/types';
import {
  Alert,
  Avatar,
  Card,
  DescriptionList,
  EmptyState,
  PageHeader,
  PriorityDot,
  Toolbar,
  type DescriptionItem,
} from '@ashniva/ui';
import { Link, useParams } from 'react-router';

import { DetailSkeleton } from '../../../shared/components/LoadingSkeletons';
import { QueryState } from '../../../shared/components/QueryState';
import { TaskStatusPill, TicketStatusPill } from '../../../shared/components/StatusPills';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { TicketCallsCard } from '../../calls/components/TicketCallsCard';
import { ticketAnchor } from '../../communication/conversation-anchors';
import { ConversationPanel } from '../../communication/components/ConversationPanel';
import { FileList } from '../../files/components/FileList';
import { SimilarIssuesPanel } from '../../problems/components/SimilarIssuesPanel';
import { TicketRelationsPanel } from '../../relations/components/TicketRelationsPanel';
import { TicketSlaCard } from '../../sla/components/TicketSlaCard';
import { TicketRoutingPanel } from '../../support-routing/components/TicketRoutingPanel';
import { useTicketQuery } from '../api';
import { TicketActions } from '../components/TicketActions';
import { TicketThread } from '../components/TicketThread';
import { TicketHistory } from '../components/TicketHistory';

/** Ticket detail: public thread vs internal notes, details, linked tasks, files, history, actions. */
export function TicketDetailPage() {
  const { id } = useParams();
  const query = useTicketQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      loadingFallback={<DetailSkeleton />}
    >
      {query.data ? <TicketDetailBody ticket={query.data} /> : null}
    </QueryState>
  );
}

function TicketDetailBody({ ticket }: { ticket: TicketDetail }) {
  const canInternal = usePermission(PERMISSIONS.COMMENT_INTERNAL);
  const canUpload = ticket.actions.some(
    (action) => action.action === 'reply-public' && action.enabled,
  );
  return (
    <div className="detail-page">
      <PageHeader
        breadcrumbs={[
          { key: 'tickets', label: 'Tickets', href: '/tickets' },
          { key: 'ticket', label: ticket.key },
        ]}
        renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
        title={ticket.title}
        subtitle={
          <Toolbar aria-label="Ticket status">
            <TicketStatusPill status={ticket.status} />
            <PriorityDot priority={ticket.priority} showLabel />
            <span>{TICKET_TYPE_LABELS[ticket.type]}</span>
            <span className="muted">· {ticket.clientOrganization.name}</span>
          </Toolbar>
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card title="Description">
            <p className="prose">{ticket.description}</p>
            {ticket.impact ? (
              <>
                <h3 className="detail-page__subheading">Impact</h3>
                <p className="prose">{ticket.impact}</p>
              </>
            ) : null}
            {/*
              An Alert rather than a paragraph with a success background painted on by hand: the
              resolution is the answer the person came for, and `role="status"` is what puts it in
              front of somebody who is not looking at that corner of the page.
            */}
            {ticket.resolution ? (
              <Alert tone="success" title="Resolution" className="detail-page__blocked">
                {ticket.resolution}
              </Alert>
            ) : null}
          </Card>
          <SimilarIssuesPanel ticketId={ticket.id} />
          <TicketRelationsPanel ticketId={ticket.id} />
          <TicketThread ticket={ticket} canInternal={canInternal} />
          <Card title="Linked tasks">
            {ticket.linkedTasks.length === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Support can convert this ticket into one or more tasks."
              />
            ) : (
              <ul className="timeline">
                {ticket.linkedTasks.map((task) => (
                  <li
                    key={task.id}
                    className="timeline__item"
                    style={{ gridTemplateColumns: '90px 1fr auto' }}
                  >
                    <Link to={`/tasks/${task.id}`}>{task.key}</Link>
                    <span>
                      {task.title}
                      <span className="timeline__note">
                        {' '}
                        · {task.assignedTo?.name ?? 'unassigned'}
                      </span>
                    </span>
                    <TaskStatusPill status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Attachments">
            <FileList
              files={ticket.files}
              parent={{ ticketId: ticket.id }}
              canUpload={canUpload}
              chooseVisibility={canInternal}
            />
          </Card>
          <TicketCallsCard ticket={ticket} />
          {canInternal ? (
            <ConversationPanel anchor={ticketAnchor(ticket.id)} title="Internal discussion" />
          ) : null}
          <Card title="Activity">
            <TicketHistory history={ticket.history} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Actions for your role">
            <TicketActions ticket={ticket} />
          </Card>
          <TicketSlaCard ticketId={ticket.id} sla={ticket.sla} showEvents />
          <TicketRoutingPanel ticket={ticket} />
          <Card title="Details">
            <DescriptionList items={detailItems(ticket)} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The Details panel's rows. Module and Resolved appear only once they have a value. */
function detailItems(ticket: TicketDetail): DescriptionItem[] {
  const items: DescriptionItem[] = [
    { key: 'company', term: 'Company', description: ticket.clientOrganization.name },
    {
      key: 'requester',
      term: 'Requester',
      description: <Person name={ticket.requester.name} />,
    },
    {
      key: 'project',
      term: 'Project',
      description: ticket.project ? (
        <Link to={`/projects/${ticket.project.id}`}>{ticket.project.name}</Link>
      ) : (
        '—'
      ),
    },
    {
      key: 'assigned-to',
      term: 'Assigned to',
      description: ticket.assignedTo ? (
        <span className="detail-page__people">
          <Person name={ticket.assignedTo.name} />
          {ticket.team ? <span className="muted">· {ticket.team.name}</span> : null}
        </span>
      ) : (
        <span className="muted">Unassigned{ticket.team ? ` · ${ticket.team.name}` : ''}</span>
      ),
    },
    { key: 'priority', term: 'Priority', description: PRIORITY_LABELS[ticket.priority] },
  ];
  if (ticket.module) {
    items.push({ key: 'module', term: 'Module', description: ticket.module });
  }
  items.push({ key: 'raised', term: 'Raised', description: formatDateTime(ticket.createdAt) });
  if (ticket.resolvedAt) {
    items.push({
      key: 'resolved',
      term: 'Resolved',
      description: formatDateTime(ticket.resolvedAt),
    });
  }
  return items;
}

function Person({ name }: { name: string }) {
  return (
    <span className="detail-page__person">
      <Avatar name={name} size="sm" />
      {name}
    </span>
  );
}
