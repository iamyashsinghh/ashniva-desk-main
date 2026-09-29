import { HEALTH_STATUS, type HealthComponent } from '@ashniva/types';
import { Fragment } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { KeyValueRow } from '../../../shared/components/data-display';
import { IconTile, type IconName } from '../../../shared/components/Icon';
import { Hero, Section, StickyActionBar } from '../../../shared/components/layout';
import {
  AppText,
  Button,
  Divider,
  Pill,
  PillRow,
  Screen,
} from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useHealth } from './health-api';

const COMPONENTS: Record<string, { label: string; icon: IconName }> = {
  database: { label: 'PostgreSQL', icon: 'server-outline' },
  redis: { label: 'Redis', icon: 'flash-outline' },
  storage: { label: 'Object storage (S3)', icon: 'cloud-outline' },
  queues: { label: 'Background jobs', icon: 'layers-outline' },
  realtime: { label: 'Live updates', icon: 'radio-outline' },
};

/**
 * System status: the API's own readiness check — database, Redis, object storage, the scheduled
 * background jobs and live updates — with each component's latency and, when down, its reason.
 */
export function SystemStatusScreen() {
  const theme = useTheme();
  const health = useHealth();

  if (!health.data) {
    return (
      <Screen>
        {health.error ? (
          <ErrorState
            message={`The API could not be reached. ${errorMessage(health.error)}`}
            offline={health.error instanceof Error && health.error.name === 'NetworkError'}
            onRetry={() => void health.refetch()}
          />
        ) : (
          <LoadingState label="Checking system status" variant="spinner" />
        )}
      </Screen>
    );
  }

  const status = health.data;
  const up = status.status === HEALTH_STATUS.UP;
  const components = Object.entries(status.components);
  const down = components.filter(([, component]) => component.status !== HEALTH_STATUS.UP).length;
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={health.isRefetching} onRefresh={() => health.refetch()} />
        }
      >
        <Hero
          overline="API"
          title={up ? 'All systems up' : 'Degraded'}
          icon={up ? 'checkmark-circle' : 'warning'}
          iconTone={up ? 'success' : 'danger'}
        >
          <PillRow>
            <Pill
              label={up ? 'Healthy' : `${down} ${down === 1 ? 'component' : 'components'} down`}
              tone={up ? 'success' : 'danger'}
            />
          </PillRow>
          <KeyValueRow label="Version" value={status.version} />
          <KeyValueRow label="Environment" value={status.environment} />
          <KeyValueRow label="Checked" value={formatDateTime(status.timestamp) ?? '—'} />
        </Hero>
        <Section title="Components" icon="pulse-outline" count={components.length}>
          {components.map(([key, component], index) => (
            <Fragment key={key}>
              {index > 0 ? <Divider /> : null}
              <ComponentRow
                label={COMPONENTS[key]?.label ?? key}
                icon={COMPONENTS[key]?.icon ?? 'hardware-chip-outline'}
                component={component}
              />
            </Fragment>
          ))}
        </Section>
        <AppText size="xs" tone="faint" align="center">
          Checked again every 30 seconds while this screen is open.
        </AppText>
      </ScrollView>
      <StickyActionBar>
        <Button
          label="Check now"
          icon="refresh"
          variant="secondary"
          loading={health.isFetching}
          onPress={() => void health.refetch()}
          style={{ flex: 1 }}
        />
      </StickyActionBar>
    </Screen>
  );
}

function ComponentRow({
  label,
  icon,
  component,
}: {
  label: string;
  icon: IconName;
  component: HealthComponent;
}) {
  const theme = useTheme();
  const up = component.status === HEALTH_STATUS.UP;
  const meta = [
    component.latencyMs !== undefined ? `${component.latencyMs} ms` : null,
    component.message ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${up ? 'up' : 'down'}${meta ? `, ${meta}` : ''}`}
      style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}
    >
      <IconTile name={icon} tone={up ? 'success' : 'danger'} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{label}</AppText>
        {meta ? (
          <AppText size="xs" tone={up ? 'muted' : 'danger'}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <Pill label={up ? 'Up' : 'Down'} tone={up ? 'success' : 'danger'} />
    </View>
  );
}
