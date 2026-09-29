import { isManagerRole, type DashboardResponse, type OperationsDashboard } from '@ashniva/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { StatTile, TileGrid } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Button, cardStyle } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useInbox } from '../notifications/notifications-api';
import { DashboardBody } from './dashboards/DashboardBody';
import { DashboardActionsProvider, type DashboardHandlers } from './dashboards/dashboard-actions';
import { OperationsBoard } from './dashboards/OperationsBoard';
import { TileSkeleton } from './HomeDashboard';

/**
 * Home's summary for the people who do the work: the same role dashboard the web app shows, from
 * the same `GET /dashboard`, with every tile opening the list it counted.
 *
 * Managers and team leads also get the operations board, as on the web. The role check only
 * decides whether to offer it; the API refuses the route to anybody else and chooses its own
 * sections. Only the visible panel is fetched and polled.
 */

export const DASHBOARD_KEY = ['dashboard'] as const;
export const OPERATIONS_KEY = ['dashboard', 'operations'] as const;
const POLL = 60_000;

type Panel = 'mine' | 'operations';

const PANELS: readonly SegmentOption<Panel>[] = [
  { value: 'mine', label: 'My dashboard', icon: 'person-circle-outline' },
  { value: 'operations', label: 'Operations', icon: 'pulse-outline' },
];

export function InternalSummary({
  onOpenAlerts,
  ...handlers
}: DashboardHandlers & { onOpenAlerts?: () => void }) {
  const theme = useTheme();
  const { user } = useSession();
  const canSeeOperations = user ? isManagerRole(user.roleKey) : false;
  const [panel, setPanel] = useState<Panel>('mine');
  const active = canSeeOperations ? panel : 'mine';

  const dashboard = useResource<DashboardResponse>(DASHBOARD_KEY, '/dashboard', {
    enabled: active === 'mine',
    refetchInterval: POLL,
  });
  const operations = useResource<OperationsDashboard>(OPERATIONS_KEY, '/dashboard/operations', {
    enabled: active === 'operations',
    refetchInterval: POLL,
  });

  return (
    <DashboardActionsProvider handlers={handlers}>
      <View style={{ gap: theme.spacing.section }}>
        {canSeeOperations ? (
          <Segmented label="Dashboard view" options={PANELS} value={active} onChange={setPanel} />
        ) : null}
        {onOpenAlerts ? <AlertsTile onOpen={onOpenAlerts} /> : null}
        {active === 'operations' ? (
          <Loaded query={operations}>{(data) => <OperationsBoard data={data} />}</Loaded>
        ) : (
          <Loaded query={dashboard}>{(data) => <DashboardBody data={data} />}</Loaded>
        )}
      </View>
    </DashboardActionsProvider>
  );
}

/**
 * A dashboard query's three states, sized for the middle of Home. What was loaded earlier stays on
 * screen when a refresh fails — Home has to be readable offline — and only a first load that
 * failed shows the retry card.
 */
function Loaded<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const theme = useTheme();
  if (query.data) {
    return <>{children(query.data)}</>;
  }
  if (query.isLoading) {
    return (
      <View
        accessible
        accessibilityLabel="Loading your dashboard"
        style={{ gap: theme.spacing.md }}
      >
        <TileSkeleton />
        <TileSkeleton />
      </View>
    );
  }
  if (!query.error) {
    return null;
  }
  return (
    <View
      style={[
        cardStyle(theme),
        { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md },
      ]}
    >
      <Icon name="cloud-offline-outline" size={22} color={theme.colors.warning} />
      <AppText size="sm" tone="muted" style={{ flex: 1 }}>
        Your dashboard could not be loaded.
      </AppText>
      <Button
        label="Try again"
        variant="ghost"
        size="sm"
        icon="refresh"
        onPress={() => void query.refetch()}
      />
    </View>
  );
}

/** Only while something is unread: the header's bell is always there, this is the nudge. */
function AlertsTile({ onOpen }: { onOpen: () => void }) {
  const inbox = useInbox();
  if (inbox.isLoading || inbox.error || inbox.unreadCount === 0) {
    return null;
  }
  return (
    <TileGrid>
      <StatTile
        label="Unread alerts"
        value={inbox.unreadCount}
        caption="Waiting for you"
        tone="primary"
        icon="notifications"
        iconTone="danger"
        onPress={onOpen}
      />
    </TileGrid>
  );
}
