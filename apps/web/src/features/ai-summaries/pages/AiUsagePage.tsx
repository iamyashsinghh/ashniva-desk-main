import { Card, PageHeader, Table, type TableColumn } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate } from '../../../shared/lib/format';
import { useAiProviderStatusQuery, useAiUsageQuery } from '../api';

import '../ai-summaries.css';

interface ProviderRow {
  providerName: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
}

/** What generation has cost, in calls and tokens, over the last thirty days. */
export function AiUsagePage() {
  const usage = useAiUsageQuery();
  const provider = useAiProviderStatusQuery();

  const columns: TableColumn<ProviderRow>[] = [
    { key: 'provider', header: 'Provider', render: (row) => row.providerName },
    { key: 'runs', header: 'Runs', width: '100px', render: (row) => row.runs },
    {
      key: 'input',
      header: 'Input tokens',
      width: '140px',
      render: (row) => row.inputTokens.toLocaleString(),
    },
    {
      key: 'output',
      header: 'Output tokens',
      width: '140px',
      render: (row) => row.outputTokens.toLocaleString(),
    },
  ];

  return (
    <div className="ai-page">
      <PageHeader
        title="AI usage"
        subtitle={
          usage.data ? `${formatDate(usage.data.from)} – ${formatDate(usage.data.to)}` : undefined
        }
      />

      <QueryState
        isLoading={usage.isLoading}
        isError={usage.isError}
        error={usage.error}
        onRetry={() => void usage.refetch()}
      >
        {usage.data ? (
          <>
            <Card title="This period">
              <div className="ai-usage">
                <Figure label="Runs" value={usage.data.runs} />
                <Figure label="Succeeded" value={usage.data.succeeded} />
                <Figure label="Failed" value={usage.data.failed} />
                <Figure label="Input tokens" value={usage.data.inputTokens} />
                <Figure label="Output tokens" value={usage.data.outputTokens} />
                <Figure
                  label="Average latency"
                  value={usage.data.averageLatencyMs ?? 0}
                  suffix=" ms"
                />
              </div>
            </Card>

            <Card title="By provider">
              <Table
                aria-label="Usage by provider"
                columns={columns}
                rows={usage.data.byProvider}
                rowKey={(row) => row.providerName}
              />
            </Card>

            <Card title="Current provider">
              <p className="muted">
                {provider.data
                  ? `${provider.data.providerName} · ${provider.data.configured ? 'configured' : 'not configured'} · prompt ${provider.data.promptVersion}, output ${provider.data.outputVersion}`
                  : 'Loading…'}
              </p>
              <p className="muted">
                The endpoint, model and credential are set per organization by an administrator
                through the integrations API; there is no screen for it yet. The credential is
                stored encrypted and is never shown again after it is saved.
              </p>
            </Card>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}

function Figure({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="ai-usage__figure">
      <span className="muted">{label}</span>
      <span className="ai-usage__value">
        {value.toLocaleString()}
        {suffix}
      </span>
    </div>
  );
}
