import { APPROVAL_SUBJECT_TYPE_LABELS, type PortalContractSummary } from '@ashniva/types';
import { Button, Card, EmptyState, Kpi, KpiGrid, PageHeader } from '@ashniva/ui';
import { Link, useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import {
  formatDate,
  formatLongDate,
  formatMinutes,
  formatRelative,
} from '../../../shared/lib/format';
import { useCurrentUser } from '../../auth/session-context';
import { FileLink } from '../../files/components/FileLink';
import { usePortalHomeQuery } from '../api';
import { PortalTicketRows } from '../components/PortalTicketRows';

import '../../dashboard/dashboard.css';

/** One line under a contract: hours left when it tracks them, otherwise the end date. */
function contractMeta(contract: PortalContractSummary): string {
  if (contract.hours) {
    return `${formatMinutes(Math.max(0, contract.hours.remainingMinutes))} support hours left`;
  }
  return contract.endDate ? `until ${formatDate(contract.endDate)}` : 'open-ended';
}

/** Client overview: own projects, progress, published updates, tickets and files only. */
export function PortalHomePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const query = usePortalHomeQuery();

  return (
    <div className="dashboard">
      <PageHeader
        title={formatLongDate()}
        subtitle={`${user.organization.name} · ${user.roleName}`}
        actions={
          <Button variant="primary" onClick={() => void navigate('/portal/tickets/new')}>
            + Raise a ticket
          </Button>
        }
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <>
            <KpiGrid>
              <Kpi
                label="Active projects"
                value={query.data.kpis.activeProjects}
                onClick={() => void navigate('/portal/projects')}
              />
              <Kpi label="Overall progress" value={`${query.data.kpis.overallProgressPercent}%`} />
              <Kpi label="In progress" value={query.data.kpis.inProgressTasks} />
              <Kpi label="Completed today" value={query.data.kpis.completedToday} />
              <Kpi label="Completed this week" value={query.data.kpis.completedThisWeek} />
              <Kpi
                label="Open tickets"
                value={query.data.kpis.openTickets}
                hint={
                  query.data.kpis.ticketsNeedingYou > 0
                    ? `${query.data.kpis.ticketsNeedingYou} need you`
                    : undefined
                }
                warn={query.data.kpis.ticketsNeedingYou > 0}
                onClick={() => void navigate('/portal/tickets')}
              />
              <Kpi
                label="Waiting for your approval"
                value={query.data.kpis.pendingApprovals}
                warn={query.data.kpis.pendingApprovals > 0}
                onClick={() => void navigate('/portal/approvals')}
              />
              <Kpi
                label="Open change requests"
                value={query.data.kpis.openChangeRequests}
                onClick={() => void navigate('/portal/change-requests')}
              />
              {query.data.kpis.supportHoursRemainingMinutes !== null ? (
                <Kpi
                  label="Support hours left"
                  value={formatMinutes(Math.max(0, query.data.kpis.supportHoursRemainingMinutes))}
                  warn={query.data.kpis.supportHoursRemainingMinutes <= 0}
                  onClick={() => void navigate('/portal/contracts')}
                />
              ) : null}
            </KpiGrid>
            <div className="dashboard__grid">
              <div className="dashboard__column">
                <Card title="Your projects">
                  {query.data.projects.length === 0 ? (
                    <EmptyState title="No projects yet" />
                  ) : (
                    <div className="project-list">
                      {query.data.projects.map((project) => (
                        <Link
                          key={project.id}
                          to={`/portal/projects/${project.id}`}
                          className="project-list__row"
                        >
                          <span
                            className="project-list__dot project-list__dot--ON_TRACK"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="project-list__name">{project.name}</span>{' '}
                            <span className="project-list__meta">
                              · {project.taskCounts.inProgress} in progress ·{' '}
                              {project.taskCounts.completed} completed
                            </span>
                          </span>
                          <span className="project-list__meta">
                            {project.lastUpdateAt
                              ? `updated ${formatRelative(project.lastUpdateAt)}`
                              : ''}
                          </span>
                          <strong>{project.progressPercent}%</strong>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
                <Card
                  title="Open tickets"
                  headerAddon={<Link to="/portal/tickets">All tickets</Link>}
                >
                  <PortalTicketRows tickets={query.data.openTickets} />
                </Card>
                <Card
                  title="Waiting for your approval"
                  headerAddon={<Link to="/portal/approvals">All approvals</Link>}
                >
                  {query.data.pendingApprovals.length === 0 ? (
                    <EmptyState title="Nothing to approve right now" />
                  ) : (
                    <ul
                      className="update-list"
                      style={{ listStyle: 'none', margin: 0, padding: 0 }}
                    >
                      {query.data.pendingApprovals.map((approval) => (
                        <li key={approval.id} className="update-list__item">
                          <Link to={`/portal/approvals/${approval.id}`}>{approval.title}</Link>
                          <span className="update-list__meta">
                            {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
                            {approval.dueDate ? ` · needed by ${formatDate(approval.dueDate)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className="dashboard__column">
                <Card
                  title="Recent updates"
                  headerAddon={<span className="muted">published by your team</span>}
                >
                  {query.data.recentUpdates.length === 0 ? (
                    <EmptyState
                      title="No updates yet"
                      description="Completed work appears here once it is published."
                    />
                  ) : (
                    <div className="update-list">
                      {query.data.recentUpdates.map((update) => (
                        <div key={update.id} className="update-list__item">
                          <span>{update.title}</span>
                          <span className="update-list__meta">
                            {update.project.name} · {formatDate(update.workDate)}
                          </span>
                          <span>{update.body}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card
                  title="Your contracts"
                  headerAddon={<Link to="/portal/contracts">All contracts</Link>}
                >
                  {query.data.contracts.length === 0 ? (
                    <EmptyState title="No contracts yet" />
                  ) : (
                    <ul
                      className="update-list"
                      style={{ listStyle: 'none', margin: 0, padding: 0 }}
                    >
                      {query.data.contracts.map((contract) => (
                        <li key={contract.id} className="update-list__item">
                          <Link to={`/portal/contracts/${contract.id}`}>
                            {contract.number} · {contract.title}
                          </Link>
                          <span className="update-list__meta">{contractMeta(contract)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Files shared with you">
                  {query.data.recentFiles.length === 0 ? (
                    <EmptyState title="No files yet" />
                  ) : (
                    <ul className="update-list">
                      {query.data.recentFiles.map((file) => (
                        <li key={file.id} className="update-list__item">
                          <FileLink file={file} />
                          <span className="update-list__meta">
                            {formatRelative(file.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
