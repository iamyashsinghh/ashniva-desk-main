import type { ClientUpdateSummary } from '@ashniva/types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { formatDate } from '../../../shared/lib/format';

interface UpdateRowProps {
  update: ClientUpdateSummary;
  published?: boolean;
  children?: ReactNode;
}

/** One client update in the publish queue or the published list. */
export function UpdateRow({ update, published = false, children }: UpdateRowProps) {
  return (
    <div
      className="update-list__item"
      style={{
        padding: 10,
        borderRadius: 6,
        background: published ? 'var(--tone-success-bg)' : 'var(--color-surface-muted)',
      }}
    >
      <span>
        {published ? '✓ ' : ''}
        {update.title}
      </span>
      <span className="update-list__meta">
        {update.clientOrganization.name} · {update.project.name} · {update.author.name} ·{' '}
        {formatDate(update.workDate)}
        {update.task ? (
          <>
            {' · '}
            <Link to={`/tasks/${update.task.id}`}>{update.task.key}</Link>
          </>
        ) : null}
        {update.publishedBy ? ` · published by ${update.publishedBy.name}` : ''}
      </span>
      <span>{update.body}</span>
      {children ? <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>{children}</span> : null}
    </div>
  );
}
