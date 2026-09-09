import { PROJECT_HEALTH_LABELS, type OperationsProjectRow } from '@ashniva/types';
import { Card, EmptyState } from '@ashniva/ui';
import { Link } from 'react-router';

import { SectionTitle } from '../DashboardWidgets';

/** The columns of the grid, in reading order: what is happening, then what is stuck. */
const COLUMNS = [
  { key: 'blocked', label: 'Blocked', warn: true },
  { key: 'overdue', label: 'Overdue', warn: true },
  { key: 'pendingQa', label: 'QA', warn: false },
  { key: 'pendingUat', label: 'UAT', warn: false },
  { key: 'pendingRelease', label: 'Release', warn: false },
  { key: 'openTickets', label: 'Tickets', warn: false },
  { key: 'escalatedTickets', label: 'Escalated', warn: true },
] as const;

/**
 * One row per project: progress, who is on it, and everything waiting on somebody else.
 *
 * The counts are the API's, not a total of anything rendered here — the grid shows the same
 * numbers the project screen does because both are computed from the same grouped queries.
 */
export function OperationsProjectsSection({ projects }: { projects: OperationsProjectRow[] }) {
  return (
    <>
      <SectionTitle hint="progress, people and what is waiting">Projects</SectionTitle>
      <Card>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects in your scope"
            description="Projects you manage, lead or are a member of appear here once one is active."
          />
        ) : (
          <div className="ops-table-scroll">
            <table className="ops-projects">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Team</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className="ops-projects__num">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((row) => (
                  <tr key={row.project.id}>
                    <td>
                      <Link to={`/projects/${row.project.id}`} className="ops-projects__name">
                        <span
                          className={`project-list__dot project-list__dot--${row.health}`}
                          aria-hidden="true"
                        />
                        {row.project.name}
                      </Link>
                      <span className="ops-projects__meta">
                        {row.clientOrganization?.name ?? 'Internal'} ·{' '}
                        {PROJECT_HEALTH_LABELS[row.health]}
                      </span>
                    </td>
                    <td>
                      <strong>{row.progressPercent}%</strong>
                    </td>
                    <td className="ops-projects__team">
                      {row.team.length === 0 ? (
                        <span className="muted">Nobody assigned</span>
                      ) : (
                        row.team.map((member) => (
                          <span key={member.id}>
                            {member.name}
                            {member.responsibilities.length > 0
                              ? ` (${member.responsibilities.join(', ')})`
                              : ''}
                          </span>
                        ))
                      )}
                    </td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={[
                          'ops-projects__num',
                          column.warn && row[column.key] > 0 ? 'ops-projects__num--warn' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
