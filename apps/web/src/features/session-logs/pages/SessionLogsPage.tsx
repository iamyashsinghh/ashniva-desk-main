import {
  ROLE_LABELS,
  type SessionLogEvent,
  type SessionLogSession,
} from '@ashniva/types';
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
import { useSessionLogsQuery } from '../api';

type View = 'sessions' | 'events';

/** Login / logout / break trail for developers, testers and interns — SA, PM and TL. */
export function SessionLogsPage() {
  const [view, setView] = useState<View>('sessions');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useSessionLogsQuery({
    userId: userId || undefined,
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  });

  const sessionColumns: TableColumn<SessionLogSession>[] = [
    {
      key: 'who',
      header: 'Person',
      width: '160px',
      render: (row) => row.user.name,
    },
    {
      key: 'role',
      header: 'Role',
      width: '120px',
      hideOnMobile: true,
      render: (row) => (row.roleKey ? ROLE_LABELS[row.roleKey] : '—'),
    },
    {
      key: 'login',
      header: 'Login',
      width: '150px',
      render: (row) => formatDateTime(row.loginAt),
    },
    {
      key: 'logout',
      header: 'Logout',
      width: '150px',
      render: (row) =>
        row.logoutAt ? (
          formatDateTime(row.logoutAt)
        ) : (
          <span className="muted">Still signed in</span>
        ),
    },
    {
      key: 'duration',
      header: 'Session',
      width: '100px',
      render: (row) => formatDuration(row.durationSeconds),
    },
    {
      key: 'break',
      header: 'Break after',
      width: '100px',
      render: (row) =>
        row.breakAfterSeconds == null ? (
          <span className="muted">—</span>
        ) : (
          formatDuration(row.breakAfterSeconds)
        ),
    },
  ];

  const eventColumns: TableColumn<SessionLogEvent>[] = [
    {
      key: 'when',
      header: 'When',
      width: '150px',
      render: (row) => formatDateTime(row.at),
    },
    {
      key: 'who',
      header: 'Person',
      width: '160px',
      render: (row) => row.user.name,
    },
    {
      key: 'role',
      header: 'Role',
      width: '120px',
      hideOnMobile: true,
      render: (row) => (row.roleKey ? ROLE_LABELS[row.roleKey] : '—'),
    },
    {
      key: 'kind',
      header: 'Event',
      width: '100px',
      render: (row) => (row.kind === 'LOGIN' ? 'Login' : 'Logout'),
    },
    {
      key: 'ip',
      header: 'IP',
      hideOnMobile: true,
      render: (row) => row.ipAddress ?? <span className="muted">—</span>,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Team login & break log"
        subtitle="When developers, testers and interns signed in and out"
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(value) => setView(value as View)}
          options={[
            { key: 'sessions', label: 'Sessions' },
            { key: 'events', label: 'Timeline' },
          ]}
        />
        <PeoplePicker value={userId} onChange={setUserId} placeholder="Anyone" />
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
      </PageHeader>
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          view === 'sessions' ? (
            query.data.sessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Login and logout events for your team will appear here."
              />
            ) : (
              <Table
                aria-label="Team sessions"
                columns={sessionColumns}
                rows={query.data.sessions}
                rowKey={(row) => row.id}
              />
            )
          ) : query.data.events.length === 0 ? (
            <EmptyState
              title="No events yet"
              description="Login and logout events for your team will appear here."
            />
          ) : (
            <Table
              aria-label="Login and logout timeline"
              columns={eventColumns}
              rows={query.data.events}
              rowKey={(row) => row.id}
            />
          )
        ) : null}
      </QueryState>
    </div>
  );
}

function formatDuration(total: number | null): string {
  if (total == null) {
    return '—';
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total}s`;
}
