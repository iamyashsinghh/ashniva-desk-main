import type { ClientUpdateSummary } from '@ashniva/types';
import { Badge, Card, EmptyState } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDate } from '../../../shared/lib/format';

/** The client updates raised from this project's work, published or waiting. */
export function ProjectUpdatesPanel({ updates }: { updates: ClientUpdateSummary[] }) {
  return (
    <Card
      title="Client updates"
      headerAddon={<Badge tone="success">Client-visible when published</Badge>}
    >
      {updates.length === 0 ? (
        <EmptyState
          title="No client updates yet"
          description="Approving a client-visible task drafts one."
        />
      ) : (
        <div className="update-list">
          {updates.map((update) => (
            <div key={update.id} className="update-list__item">
              <span>
                {update.status === 'PUBLISHED' ? '✓ ' : ''}
                {update.title}
                {update.status === 'PENDING' ? (
                  <Badge tone="warning">Waiting to publish</Badge>
                ) : null}
                {update.status === 'WITHDRAWN' ? <Badge tone="neutral">Withdrawn</Badge> : null}
              </span>
              <span className="update-list__meta">
                {formatDate(update.workDate)} · {update.author.name}
                {update.task ? (
                  <>
                    {' · '}
                    <Link to={`/tasks/${update.task.id}`}>{update.task.key}</Link>
                  </>
                ) : null}
              </span>
              <span>{update.body}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
