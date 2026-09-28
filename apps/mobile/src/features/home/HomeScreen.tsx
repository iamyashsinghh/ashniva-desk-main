import { PERMISSIONS, TASK_LIST_VIEW, isClientRole } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mobileEnv } from '../../config/env';
import { Avatar } from '../../shared/components/Avatar';
import { Banner } from '../../shared/components/feedback';
import { SectionHeader } from '../../shared/components/layout';
import { NavigationRow } from '../../shared/components/navigation-list';
import { AppText, Screen } from '../../shared/components/primitives';
import { useNetworkStatus } from '../../shared/hooks/use-network-status';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { isProviderUser } from '../auth/audience';
import { canUseInternalChat } from '../chat/chat-access';
import { ClientSummary } from './HomeDashboard';
import { InternalSummary } from './InternalSummary';
import { useClientWaiting } from './use-client-waiting';

/**
 * The first screen after signing in, and the way to everything the tab bar cannot hold.
 *
 * A bottom bar holds five entries comfortably and the internal one is already full — Home, Tasks,
 * Tickets, Alerts, You. Projects, messages, the testing queue, approvals and your logged time
 * could each have displaced one of those, and none of them is a better answer than what it would
 * push out: nobody opens this app more often for a project than for the tasks on it. So they live
 * here, one tap in, named and described rather than behind an icon.
 *
 * Each row is offered on the same basis as a tab — what the person may actually do, not what
 * their role is usually allowed. And as with a tab, the row appearing is never authority: the API
 * decides on every request behind it.
 */
export function HomeScreen({
  onRefresh,
  onOpenProjects,
  onOpenConversations,
  onOpenQa,
  onOpenApprovals,
  onOpenSignOffs,
  onOpenMyTime,
  onOpenApproval,
  onOpenTask,
  onOpenTasks,
  onOpenTicket,
  onOpenTickets,
  onOpenAlerts,
  onOpenProfile,
}: {
  onRefresh?: () => void;
  onOpenProjects: () => void;
  onOpenConversations: () => void;
  onOpenQa: () => void;
  onOpenApprovals: () => void;
  onOpenSignOffs: () => void;
  onOpenMyTime: () => void;
  /** The summaries on Home open the same screens their tabs do; each is optional. */
  onOpenApproval?: (id: string) => void;
  onOpenTask?: (id: string) => void;
  onOpenTasks?: () => void;
  onOpenTicket?: (id: string) => void;
  onOpenTickets?: () => void;
  onOpenAlerts?: () => void;
  onOpenProfile?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, status, can } = useSession();
  const { isOnline } = useNetworkStatus();
  const waiting = useClientWaiting(user);
  const [refreshing, setRefreshing] = useState(false);

  if (!user) {
    return null;
  }

  const isClient = isClientRole(user.roleKey);
  const isProvider = isProviderUser(user);
  const showProjects = !isClient && can(PERMISSIONS.PROJECT_READ);
  const showChat = canUseInternalChat(user);
  const showQa = !isClient && can(PERMISSIONS.QA_RECORD_RESULT);
  // Both audiences have approvals; they are different endpoints behind one row. The provider's
  // list needs `project:read` and the client's needs nothing beyond being in the portal.
  const showApprovals = isProvider ? can(PERMISSIONS.PROJECT_READ) : true;
  // Reading a sign-off needs `project:read`; answering one needs `uat:decide`, which the screen
  // asks about rather than this row.
  const showSignOffs = !isProvider && can(PERMISSIONS.PROJECT_READ);
  const showMyTime = isProvider && can(PERMISSIONS.REPORT_READ_OWN);

  const refresh = async () => {
    setRefreshing(true);
    onRefresh?.();
    waiting.refresh();
    // Only what Home itself shows; each is a query Home already made.
    await Promise.allSettled(
      isClient
        ? []
        : [
            queryClient.refetchQueries({ queryKey: ['tasks', TASK_LIST_VIEW.MY], type: 'active' }),
            queryClient.refetchQueries({ queryKey: ['tickets'], type: 'active' }),
            queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' }),
          ],
    );
    setRefreshing(false);
  };

  // A client has Home, Tickets, Updates, Invoices and You — no Alerts tab to jump to.
  const hasAlertsTab = !isClient;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.section,
          padding: theme.spacing.screen,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title">
              {greeting()}, {user.name.split(' ')[0]}
            </AppText>
            <AppText size="sm" tone="muted" numberOfLines={1}>
              {user.roleName} · {user.organization.name}
            </AppText>
          </View>
          {onOpenProfile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              hitSlop={8}
              onPress={onOpenProfile}
            >
              <Avatar name={user.name} size={44} />
            </Pressable>
          ) : null}
        </View>

        {status === 'offline' || !isOnline ? (
          <Banner tone="warning" title={status === 'offline' ? 'Working offline' : 'No connection'}>
            {status === 'offline'
              ? 'Your session could not be checked. What you see was loaded earlier, and nothing new will arrive until you are back on a connection.'
              : 'Lists will show what was last loaded. Pull down to try again once you are back on.'}
          </Banner>
        ) : null}

        {isClient ? (
          <ClientSummary onOpenApprovals={onOpenApprovals} onOpenApproval={onOpenApproval} />
        ) : (
          <InternalSummary
            onOpenTask={onOpenTask}
            onOpenTasks={onOpenTasks}
            onOpenTicket={onOpenTicket}
            onOpenTickets={onOpenTickets}
            onOpenAlerts={hasAlertsTab ? onOpenAlerts : undefined}
          />
        )}

        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader title="Go to" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
            {showProjects ? (
              <NavigationRow
                layout="tile"
                label="Projects"
                mark="Pr"
                description="Where each project stands and who is on it."
                onPress={onOpenProjects}
              />
            ) : null}

            {showApprovals ? (
              <NavigationRow
                layout="tile"
                label="Approvals"
                mark="Ap"
                description={
                  isProvider
                    ? 'Requests to prepare, publish and follow up with a client.'
                    : 'What your team has asked you to approve.'
                }
                badge={waiting.pendingApprovals}
                badgeUnit="waiting for you"
                onPress={onOpenApprovals}
              />
            ) : null}

            {showSignOffs ? (
              <NavigationRow
                layout="tile"
                label="Sign-offs"
                mark="So"
                description="Changes your team has finished, for you to try and answer."
                onPress={onOpenSignOffs}
              />
            ) : null}

            {showChat ? (
              <NavigationRow
                layout="tile"
                label="Messages"
                mark="Me"
                description="Internal conversations on your projects, tasks and tickets."
                onPress={onOpenConversations}
              />
            ) : null}

            {showQa ? (
              <NavigationRow
                layout="tile"
                label="Testing"
                mark="Qa"
                description="Your testing queue and the pass/fail form."
                onPress={onOpenQa}
              />
            ) : null}

            {showMyTime ? (
              <NavigationRow
                layout="tile"
                label="My time"
                mark="Ti"
                description="The hours you have logged, by the day you did them."
                onPress={onOpenMyTime}
              />
            ) : null}
          </View>
        </View>

        <View style={{ gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xs }}>
          <AppText size="sm" weight="medium" tone="muted">
            {isClient ? 'What you can do here' : 'On your phone'}
          </AppText>
          <AppText size="xs" tone="faint">
            {isClient
              ? 'Raise a ticket, follow the ones you have open, approve what your team sends you, read what has been published, and check an invoice.'
              : 'Your tasks, the tickets you are on, approvals, your logged time, and what needs your attention. Everything else — reports, administration, billing setup — is on the web app.'}
          </AppText>
        </View>

        {mobileEnv.isDevelopment ? (
          <AppText size="xs" tone="faint">
            Development build — {mobileEnv.apiBaseUrl}
          </AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}
