import { AUDIT_ENTITY_TYPE_LABELS, type AuditLogEntrySummary } from '@ashniva/types';
import {
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { useAuditLogsQuery } from '../../reports/api';

const TYPES = Object.entries(AUDIT_ENTITY_TYPE_LABELS);

/** Audit history: who did what, when — with type, person, date and search filters. */
export function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const query = useAuditLogsQuery({
    entityType: entityType || undefined,
    actorUserId: actorUserId || undefined,
    from: from ? `${from}T00:00:00Z` : undefined,
    to: to ? `${to}T23:59:59Z` : undefined,
    search: search || undefined,
  });

  const columns: TableColumn<AuditLogEntrySummary>[] = [
    {
      key: 'when',
      header: 'When',
      width: '150px',
      render: (entry) => formatDateTime(entry.createdAt),
    },
    {
      key: 'who',
      header: 'Who',
      width: '150px',
      render: (entry) => entry.actor?.name ?? <span className="muted">system</span>,
    },
    {
      key: 'type',
      header: 'Type',
      width: '120px',
      hideOnMobile: true,
      render: (entry) =>
        AUDIT_ENTITY_TYPE_LABELS[entry.entityType as keyof typeof AUDIT_ENTITY_TYPE_LABELS] ??
        entry.entityType,
    },
    {
      key: 'action',
      header: 'Action',
      render: (entry) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>
          {entry.action}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      hideOnMobile: true,
      render: (entry) => <span className="muted">{summarize(entry)}</span>,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Audit history"
        subtitle={query.data ? `${query.data.total} entries` : undefined}
      >
        <SegmentedControl
          aria-label="Type"
          size="sm"
          value={entityType}
          onChange={setEntityType}
          options={[{ key: '', label: 'All' }, ...TYPES.map(([key, label]) => ({ key, label }))]}
        />
        <PeoplePicker value={actorUserId} onChange={setActorUserId} placeholder="Anyone" />
        <Input
          type="date"
          aria-label="From"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          type="date"
          aria-label="To"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Input
          type="search"
          aria-label="Search"
          placeholder="Action or entity id…"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setSearch((event.target as HTMLInputElement).value);
            }
          }}
        />
      </PageHeader>
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Audit log"
            columns={columns}
            rows={query.data.items}
            rowKey={(entry) => entry.id}
            empty={<EmptyState title="No audit entries match" />}
          />
        ) : null}
      </QueryState>
    </div>
  );
}

function summarize(entry: AuditLogEntrySummary): string {
  const after = entry.after;
  if (typeof after !== 'object' || after === null) {
    return entry.entityId ?? '';
  }
  return Object.entries(after as Record<string, unknown>)
    .filter(
      ([, value]) =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    )
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}
