import {
  AVAILABILITY_STATUS_LABELS,
  WEEKDAY_LABELS,
  minutesToClock,
  type OperationsAvailabilityEntry,
  type OperationsTeamMember,
} from '@ashniva/types';
import { AVAILABILITY_STATUS_TONES, Badge, Card, EmptyState } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatMinutes } from '../../../../shared/lib/format';
import { SectionTitle } from '../DashboardWidgets';

/** A rota as one line: "Mon–Fri 09:30–18:30 Asia/Kolkata", or nothing when none is configured. */
function scheduleLabel(schedule: OperationsAvailabilityEntry['schedule']): string {
  if (!schedule || schedule.workingDays.length === 0) {
    return 'No working hours configured';
  }
  const days = schedule.workingDays
    .map((day) => WEEKDAY_LABELS[day]?.slice(0, 3) ?? '')
    .filter(Boolean)
    .join(' ');
  return `${days} · ${minutesToClock(schedule.startMinute)}–${minutesToClock(schedule.endMinute)} ${schedule.timezone}`;
}

/**
 * Who is on the team, what they are holding, and whether they are reachable.
 *
 * Both halves are optional and independently permitted, so each renders on its own: a caller may
 * see the load without the rota, or the rota without the load, and neither absence is described
 * as an empty result.
 */
export function OperationsTeamSection({
  team,
  availability,
}: {
  team?: OperationsTeamMember[];
  availability?: OperationsAvailabilityEntry[];
}) {
  if (!team && !availability) {
    return null;
  }
  const availabilityByUser = new Map((availability ?? []).map((entry) => [entry.user.id, entry]));
  return (
    <>
      <SectionTitle hint="current work and who is reachable">Team</SectionTitle>
      <Card>
        {team && team.length === 0 ? (
          <EmptyState
            title="Nobody in your team yet"
            description="People appear here once they are members of a team you lead."
          />
        ) : null}
        {team && team.length > 0 ? (
          <div className="ops-table-scroll">
            <table className="ops-team">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Working on</th>
                  <th scope="col" className="ops-projects__num">
                    Open
                  </th>
                  <th scope="col" className="ops-projects__num">
                    Due today
                  </th>
                  <th scope="col" className="ops-projects__num">
                    Delayed
                  </th>
                  <th scope="col" className="ops-projects__num">
                    Time today
                  </th>
                  {availability ? <th scope="col">Availability</th> : null}
                </tr>
              </thead>
              <tbody>
                {team.map((member) => {
                  const state = availabilityByUser.get(member.user.id);
                  return (
                    <tr key={member.user.id}>
                      <td>
                        <span className="ops-team__name">{member.user.name}</span>
                        <span className="ops-projects__meta">{member.title ?? '—'}</span>
                      </td>
                      <td>
                        {member.currentTask ? (
                          <Link to={`/tasks/${member.currentTask.id}`}>
                            {member.currentTask.key} · {member.currentTask.title}
                          </Link>
                        ) : (
                          <span className="muted">Nothing in progress</span>
                        )}
                      </td>
                      <td className="ops-projects__num">{member.openTasks}</td>
                      <td className="ops-projects__num">{member.dueToday}</td>
                      <td
                        className={[
                          'ops-projects__num',
                          member.delayed > 0 ? 'ops-projects__num--warn' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {member.delayed}
                      </td>
                      <td className="ops-projects__num">{formatMinutes(member.minutesToday)}</td>
                      {availability ? (
                        <td>
                          {state ? (
                            <>
                              <Badge tone={AVAILABILITY_STATUS_TONES[state.status]}>
                                {AVAILABILITY_STATUS_LABELS[state.status]}
                              </Badge>
                              {state.onCall ? <Badge tone="info">On call</Badge> : null}
                              <span className="ops-projects__meta">
                                {scheduleLabel(state.schedule)}
                              </span>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {!team && availability ? (
          <ul className="ops-availability">
            {availability.length === 0 ? (
              <li className="muted">Nobody in your scope has availability recorded.</li>
            ) : (
              availability.map((entry) => (
                <li key={entry.user.id}>
                  <span className="ops-team__name">{entry.user.name}</span>
                  <Badge tone={AVAILABILITY_STATUS_TONES[entry.status]}>
                    {AVAILABILITY_STATUS_LABELS[entry.status]}
                  </Badge>
                  <span className="ops-projects__meta">{scheduleLabel(entry.schedule)}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
