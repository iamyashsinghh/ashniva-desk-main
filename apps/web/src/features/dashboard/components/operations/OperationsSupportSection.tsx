import type { OperationsScope, OperationsSupport } from '@ashniva/types';
import { Badge, Card, EmptyState, Kpi, KpiGrid } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDateTime } from '../../../../shared/lib/format';
import { operationsTicketLink, type OperationsTicketCard } from '../../card-links';
import { SectionTitle } from '../DashboardWidgets';
import { OperationsKpi } from './OperationsKpi';

const CARDS: Array<{ key: OperationsTicketCard; label: string; warn?: boolean }> = [
  { key: 'newTickets', label: 'New tickets' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'escalated', label: 'Escalated', warn: true },
  { key: 'slaAtRisk', label: 'SLA at risk', warn: true },
  { key: 'slaBreached', label: 'SLA breached', warn: true },
];

const VALUES: Record<OperationsTicketCard, keyof OperationsSupport> = {
  newTickets: 'newTickets',
  assigned: 'assigned',
  escalated: 'escalated',
  slaAtRisk: 'slaAtRisk',
  slaBreached: 'slaBreached',
};

const NO_LIST =
  'The ticket list filters one project at a time, so it cannot show exactly the projects this ' +
  'number covers. Open a project to see its tickets.';

/** The support desk: what is unowned, what is late, and where a ticket goes when nobody takes it. */
export function OperationsSupportSection({
  support,
  scope,
}: {
  support: OperationsSupport;
  scope: OperationsScope;
}) {
  return (
    <>
      <SectionTitle hint="tickets waiting on somebody">Support</SectionTitle>
      <KpiGrid>
        {CARDS.map((card) => {
          const value = support[VALUES[card.key]] as number;
          return (
            <OperationsKpi
              key={card.key}
              label={card.label}
              value={value}
              warn={card.warn === true && value > 0}
              to={operationsTicketLink(scope, card.key)}
              unavailableReason={NO_LIST}
            />
          );
        })}
        {/* No list view selects "the acknowledgement timer ran out", so this one never links. */}
        <Kpi
          label="Unacknowledged"
          value={support.unacknowledged}
          warn={support.unacknowledged > 0}
        />
      </KpiGrid>
      <div className="dashboard__grid">
        <div className="dashboard__column">
          <Card title="Needs somebody">
            {support.attention.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                description="Escalated tickets and ones nobody acknowledged in time appear here."
              />
            ) : (
              <ul className="ops-attention">
                {support.attention.map((row) => (
                  <li key={row.ticket.id}>
                    <Link to={`/tickets/${row.ticket.id}`}>
                      {row.ticket.key} · {row.ticket.title}
                    </Link>
                    <span className="ops-projects__meta">
                      {row.owner ? `Owner: ${row.owner.name}` : 'In the queue'}
                      {row.escalationLevel > 0 ? ` · escalation ${row.escalationLevel}` : ''}
                      {row.acknowledgedAt === null && row.acknowledgeDueAt
                        ? ` · acknowledge by ${formatDateTime(row.acknowledgeDueAt)}`
                        : ''}
                      {row.queueReason ? ` · ${row.queueReason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="dashboard__column">
          {support.routing ? (
            <Card title="Routing fallback" headerAddon={<span className="muted">per project</span>}>
              {support.routing.length === 0 ? (
                <EmptyState
                  title="No routing configured"
                  description="Projects with support ownership set up appear here."
                />
              ) : (
                <ul className="ops-attention">
                  {support.routing.map((row) => (
                    <li key={row.project.id}>
                      <span className="ops-team__name">{row.project.name}</span>
                      {row.autoRouteEnabled ? null : <Badge tone="warning">Auto-route off</Badge>}
                      <span className="ops-projects__meta">
                        {row.fallbackUser
                          ? `Falls back to ${row.fallbackUser.name}`
                          : 'Falls back to the support queue'}{' '}
                        · acknowledge in {row.ackMinutes}m · escalate after {row.escalationMinutes}m
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
