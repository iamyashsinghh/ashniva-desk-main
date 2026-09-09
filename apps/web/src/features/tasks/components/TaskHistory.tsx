import { TASK_STATUS_LABELS, type TaskHistoryEntry, type WorkLogSummary } from '@ashniva/types';
import { EmptyState } from '@ashniva/ui';

import { formatDate, formatDateTime, formatMinutes } from '../../../shared/lib/format';

export function TaskHistory({ history }: { history: TaskHistoryEntry[] }) {
  if (history.length === 0) {
    return <EmptyState title="No history yet" />;
  }
  return (
    <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {[...history].reverse().map((entry) => (
        <li key={entry.id} className="timeline__item">
          <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
          <span>
            <strong>{entry.changedBy.name}</strong> {describeChange(entry)}
            {entry.note ? <span className="timeline__note"> — {entry.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TaskWorkLogs({ workLogs }: { workLogs: WorkLogSummary[] }) {
  if (workLogs.length === 0) {
    return (
      <EmptyState
        title="No time logged yet"
        description="Submitting work or logging time adds entries here."
      />
    );
  }
  return (
    <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {workLogs.map((log) => (
        <li key={log.id} className="timeline__item">
          <span className="timeline__when">
            {formatDate(log.workDate)}
            <br />
            <strong>{formatMinutes(log.minutes)}</strong>
          </span>
          <span>
            {log.summary}
            <span className="timeline__note">
              {' '}
              · {log.user.name}
              {log.gitRef ? ` · ${log.gitRef}` : ''}
              {log.proofUrl ? (
                <>
                  {' · '}
                  <a href={log.proofUrl} target="_blank" rel="noreferrer">
                    proof
                  </a>
                </>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function describeChange(entry: TaskHistoryEntry): string {
  if (!entry.fromStatus) {
    return `created it as ${TASK_STATUS_LABELS[entry.toStatus]}`;
  }
  if (entry.fromStatus === entry.toStatus) {
    return 'updated it';
  }
  return `moved it from ${TASK_STATUS_LABELS[entry.fromStatus]} to ${TASK_STATUS_LABELS[entry.toStatus]}`;
}
