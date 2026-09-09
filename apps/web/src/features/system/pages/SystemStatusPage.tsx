import { HEALTH_STATUS, type HealthComponent } from '@ashniva/types';
import { Button, Card, EmptyState, Spinner, StatusPill } from '@ashniva/ui';

import { useHealthQuery } from '../api';

import './system-status-page.css';

const COMPONENT_LABELS: Record<string, string> = {
  database: 'PostgreSQL',
  redis: 'Redis',
  storage: 'Object storage (S3)',
  queues: 'Background jobs',
  realtime: 'Live updates',
};

/** Live view of GET /health — the first real end-to-end slice of the stack. */
export function SystemStatusPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHealthQuery();

  if (isLoading) {
    return <Spinner label="Checking system status" />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="The API could not be reached"
        description={error instanceof Error ? error.message : 'Unknown error'}
        action={
          <Button variant="primary" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="system-status">
      <Card
        title="API"
        headerAddon={
          <>
            <StatusPill
              tone={data.status === HEALTH_STATUS.UP ? 'success' : 'danger'}
              label={data.status === HEALTH_STATUS.UP ? 'All systems up' : 'Degraded'}
            />
            <Button size="sm" onClick={() => void refetch()} loading={isFetching}>
              Refresh
            </Button>
          </>
        }
      >
        <dl className="system-status__facts">
          <dt>Version</dt>
          <dd>{data.version}</dd>
          <dt>Environment</dt>
          <dd>{data.environment}</dd>
          <dt>Checked at</dt>
          <dd>
            {new Date(data.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </dd>
        </dl>
      </Card>

      <Card title="Components">
        <ul className="system-status__components">
          {Object.entries(data.components).map(([key, component]) => (
            <ComponentRow key={key} name={COMPONENT_LABELS[key] ?? key} component={component} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ComponentRow({ name, component }: { name: string; component: HealthComponent }) {
  const isUp = component.status === HEALTH_STATUS.UP;
  return (
    <li className="system-status__component">
      <span className="system-status__component-name">{name}</span>
      <span className="system-status__component-meta">
        {component.latencyMs !== undefined ? `${component.latencyMs} ms` : null}
        {component.message ? ` · ${component.message}` : null}
      </span>
      <StatusPill tone={isUp ? 'success' : 'danger'} label={isUp ? 'Up' : 'Down'} />
    </li>
  );
}
