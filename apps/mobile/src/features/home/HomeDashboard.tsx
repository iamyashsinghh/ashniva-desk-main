import { type PortalHome } from '@ashniva/types';
import { View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { ProgressBar, StatTile, TileGrid } from '../../shared/components/data-display';
import { Skeleton } from '../../shared/components/feedback';
import { SectionHeader, PressableCard } from '../../shared/components/layout';
import { IconTile } from '../../shared/components/Icon';
import { AppText, Button, Pill, PillRow, cardStyle } from '../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What Home shows before the list of places to go: the state of your work, at a glance.
 *
 * A client's numbers come from `GET /portal/home`, which Home has always requested for the
 * approvals badge. An internal person's are the role dashboard — see `InternalSummary`.
 *
 * Every part of this is additive. Home must paint on a cold start with no network, so a failed
 * or slow request leaves a section out rather than putting an error on the screen.
 */

export const PREVIEW_LENGTH = 3;

export function ClientSummary({
  onOpenApprovals,
  onOpenApproval,
}: {
  onOpenApprovals: () => void;
  onOpenApproval?: (id: string) => void;
}) {
  const theme = useTheme();
  // The same key as `useClientWaiting`, so this is one request, not two.
  const home = useResource<PortalHome>(['portal', 'home'], '/portal/home');
  const kpis = home.data?.kpis;

  if (home.isLoading) {
    return <TileSkeleton />;
  }
  if (!kpis || typeof kpis.activeProjects !== 'number') {
    return null;
  }

  const waiting = (home.data?.pendingApprovals ?? []).slice(0, PREVIEW_LENGTH);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <TileGrid>
        <StatTile
          label="Overall progress"
          icon="trending-up"
          value={`${kpis.overallProgressPercent}%`}
          caption={`${kpis.activeProjects} active ${kpis.activeProjects === 1 ? 'project' : 'projects'}`}
        >
          <View style={{ marginTop: theme.spacing.sm }}>
            <ProgressBar percent={kpis.overallProgressPercent} />
          </View>
        </StatTile>
        <StatTile
          label="Open tickets"
          icon="ticket"
          iconTone="orange"
          value={kpis.openTickets}
          caption={
            kpis.ticketsNeedingYou > 0 ? `${kpis.ticketsNeedingYou} need you` : 'None need you'
          }
          tone={kpis.ticketsNeedingYou > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Done this week"
          icon="checkmark-done"
          iconTone="success"
          value={kpis.completedThisWeek}
          caption={`${kpis.completedToday} today`}
        />
        {kpis.supportHoursRemainingMinutes !== null ? (
          <StatTile
            label="Support time left"
            icon="hourglass"
            iconTone="violet"
            value={formatMinutes(kpis.supportHoursRemainingMinutes)}
            caption="Across active contracts"
          />
        ) : (
          <StatTile
            label="In progress"
            icon="construct"
            iconTone="info"
            value={kpis.inProgressTasks}
            caption="Tasks being worked on"
          />
        )}
      </TileGrid>

      {waiting.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader
            title="Needs your answer"
            icon="hand-left-outline"
            count={kpis.pendingApprovals}
            action={<Button label="See all" variant="ghost" size="sm" onPress={onOpenApprovals} />}
          />
          {waiting.map((approval) => (
            <PressableCard
              key={approval.id}
              highlight
              icon="shield-checkmark-outline"
              iconTone={approval.isOverdue ? 'danger' : 'success'}
              accessibilityLabel={approval.title}
              onPress={() => (onOpenApproval ? onOpenApproval(approval.id) : onOpenApprovals())}
            >
              {approval.project ? (
                <AppText size="xs" tone="faint" numberOfLines={1}>
                  {approval.project.name}
                </AppText>
              ) : null}
              <AppText weight="medium" numberOfLines={2}>
                {approval.title}
              </AppText>
              <PillRow>
                {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
                {approval.dueDate ? (
                  <AppText size="xs" tone="muted">
                    Due {formatDate(approval.dueDate)}
                  </AppText>
                ) : null}
              </PillRow>
            </PressableCard>
          ))}
        </View>
      ) : null}

      {(home.data?.recentUpdates ?? []).length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader title="Latest from your team" icon="megaphone-outline" />
          {(home.data?.recentUpdates ?? []).slice(0, 2).map((update) => (
            <View
              key={update.id}
              style={[
                cardStyle(theme),
                { alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md },
              ]}
            >
              <IconTile name="newspaper-outline" tone="violet" size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="xs" tone="faint" numberOfLines={1}>
                  {update.project.name} · {formatDate(update.workDate)}
                </AppText>
                <AppText weight="medium" numberOfLines={1}>
                  {update.title}
                </AppText>
                <AppText size="sm" tone="muted" numberOfLines={2}>
                  {update.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TileSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      <View style={{ flex: 1 }}>
        <Skeleton height={92} radius={theme.radius.md} />
      </View>
      <View style={{ flex: 1 }}>
        <Skeleton height={92} radius={theme.radius.md} />
      </View>
    </View>
  );
}
