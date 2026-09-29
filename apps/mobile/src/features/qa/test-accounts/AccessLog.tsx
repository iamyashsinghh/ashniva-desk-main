import type { CredentialAccessLogRow, PaginatedResponse } from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';
import { ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { QueryState } from '../../../shared/components/states';
import { formatDateTime } from '../../../shared/format/format';

/** Who has read, rotated or recorded a password on this project — the first page, newest first. */
export function AccessLog({ projectId }: { projectId: string }) {
  const log = useResource<PaginatedResponse<CredentialAccessLogRow>>(
    ['qa', 'credential-access-log', projectId],
    '/credential-access-log',
    { query: { projectId } },
  );
  const rows = log.data?.items ?? [];

  return (
    <Section title="Who has read a password" icon="eye-outline">
      <QueryState
        isLoading={log.isLoading}
        error={log.error}
        isEmpty={rows.length === 0}
        emptyTitle="Nothing read yet"
        emptyDescription="Every reveal, rotation and new login lands here."
        emptyIcon="eye-off-outline"
        onRetry={() => void log.refetch()}
      >
        {rows.map((row) => (
          <ListRow
            key={row.id}
            title={`${row.userName} · ${row.action.toLowerCase()} · ${row.testAccountLabel}`}
            subtitle={`${formatDateTime(row.revealedAt)}${row.ipAddress ? ` · ${row.ipAddress}` : ''}`}
          />
        ))}
      </QueryState>
    </Section>
  );
}
