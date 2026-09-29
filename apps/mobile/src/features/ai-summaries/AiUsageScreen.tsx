import { PERMISSIONS, type AiProviderStatus, type AiUsageTotals } from '@ashniva/types';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { KeyValueRow, ProgressBar, StatTile, TileGrid } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useAiProviderStatus, useAiUsage } from './api';

/** What generation has cost, in runs and tokens, over the last thirty days. */
export function AiUsageScreen() {
  const theme = useTheme();
  const { can } = useSession();
  const canRead = can(PERMISSIONS.AI_SUMMARY_READ);
  const usage = useAiUsage(canRead);
  const provider = useAiProviderStatus(canRead);

  if (!canRead) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          description="AI usage needs the ai-summary:read permission."
        />
      </Screen>
    );
  }
  if (usage.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading usage" />
      </Screen>
    );
  }
  if (!usage.data) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(usage.error)}
          offline={usage.error instanceof Error && usage.error.name === 'NetworkError'}
          onRetry={() => void usage.refetch()}
        />
      </Screen>
    );
  }

  const totals = usage.data;
  const refresh = () => {
    void usage.refetch();
    void provider.refetch();
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={usage.isRefetching} onRefresh={refresh} />}
      >
        <AppText size="sm" tone="muted">
          {formatDate(totals.from)} – {formatDate(totals.to)}
        </AppText>
        <TileGrid>
          <StatTile label="Runs" value={totals.runs.toLocaleString()} icon="flash-outline" />
          <StatTile
            label="Succeeded"
            value={totals.succeeded.toLocaleString()}
            icon="checkmark-circle-outline"
            iconTone="success"
          />
          <StatTile
            label="Failed"
            value={totals.failed.toLocaleString()}
            tone={totals.failed > 0 ? 'danger' : 'default'}
            icon="alert-circle-outline"
            iconTone="danger"
          />
          <StatTile
            label="Average latency"
            value={`${(totals.averageLatencyMs ?? 0).toLocaleString()} ms`}
            icon="speedometer-outline"
            iconTone="teal"
          />
          <StatTile
            label="Input tokens"
            value={totals.inputTokens.toLocaleString()}
            icon="arrow-up-circle-outline"
            iconTone="violet"
          />
          <StatTile
            label="Output tokens"
            value={totals.outputTokens.toLocaleString()}
            icon="arrow-down-circle-outline"
            iconTone="orange"
          />
        </TileGrid>
        <SuccessRate totals={totals} />
        <ByProvider totals={totals} />
        <CurrentProvider status={provider.data} />
      </ScrollView>
    </Screen>
  );
}

function SuccessRate({ totals }: { totals: AiUsageTotals }) {
  if (totals.runs === 0) {
    return null;
  }
  const rate = Math.round((totals.succeeded / totals.runs) * 100);
  return (
    <Section title="Success rate" icon="pie-chart-outline">
      <AppText variant="heading" tabular>
        {rate}% of runs succeeded
      </AppText>
      <ProgressBar
        percent={rate}
        tone={rate >= 90 ? 'success' : 'warning'}
        height={10}
        label="Share of runs that succeeded"
      />
    </Section>
  );
}

/** Each provider's share of the runs, as a bar, with its token counts under it. */
function ByProvider({ totals }: { totals: AiUsageTotals }) {
  const theme = useTheme();
  return (
    <Section title="By provider" icon="server-outline" count={totals.byProvider.length}>
      {totals.byProvider.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing was generated in this period.
        </AppText>
      ) : null}
      {totals.byProvider.map((row, index) => (
        <View key={row.providerName} style={{ gap: theme.spacing.xs }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <AppText weight="medium" style={{ flex: 1 }}>
              {row.providerName}
            </AppText>
            <AppText weight="bold" tabular>
              {row.runs.toLocaleString()} {row.runs === 1 ? 'run' : 'runs'}
            </AppText>
          </View>
          <ProgressBar
            percent={totals.runs > 0 ? (row.runs / totals.runs) * 100 : 0}
            label={`${row.providerName} share of runs`}
          />
          <AppText size="xs" tone="muted" tabular>
            {row.inputTokens.toLocaleString()} input · {row.outputTokens.toLocaleString()} output
            tokens
          </AppText>
        </View>
      ))}
    </Section>
  );
}

function CurrentProvider({ status }: { status: AiProviderStatus | undefined }) {
  return (
    <Section title="Current provider" icon="hardware-chip-outline">
      {status ? (
        <>
          <KeyValueRow label="Provider" value={status.providerName} />
          <KeyValueRow
            label="Status"
            value={
              <Pill
                label={status.configured ? 'Configured' : 'Not configured'}
                tone={status.configured ? 'success' : 'warning'}
              />
            }
          />
          <KeyValueRow label="Model" value={status.model ?? '—'} />
          <KeyValueRow label="Prompt version" value={status.promptVersion} />
          <KeyValueRow label="Output version" value={status.outputVersion} />
        </>
      ) : (
        <AppText size="sm" tone="muted">
          Loading…
        </AppText>
      )}
      <AppText size="xs" tone="faint">
        The endpoint, model and credential are set per organization by an administrator through the
        integrations API. The credential is stored encrypted and is never shown again after it is
        saved.
      </AppText>
    </Section>
  );
}
