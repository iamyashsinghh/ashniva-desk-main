import { PERMISSIONS, isClientRole } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../shared/components/feedback';
import { SectionHeader } from '../../shared/components/layout';
import { NavigationRow } from '../../shared/components/navigation-list';
import { Screen } from '../../shared/components/primitives';
import { useNetworkStatus } from '../../shared/hooks/use-network-status';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { isProviderUser } from '../auth/audience';
import { canUseInternalChat } from '../chat/chat-access';
import type { ListRequest } from './dashboards/dashboard-actions';
import { ClientSummary } from './HomeDashboard';
import { HomeFooter } from './HomeFooter';
import { HomeHeader } from './HomeHeader';
import { DASHBOARD_KEY, InternalSummary } from './InternalSummary';
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
  onOpenTaskList,
  onOpenTicketList,
  onOpenAlerts,
  onOpenProfile,
  onOpenMenu,
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
  /**
   * A dashboard tile opens the filtered list it counted. Without these the tiles still show their
   * numbers but are not pressable.
   */
  onOpenTaskList?: (target: ListRequest) => void;
  onOpenTicketList?: (target: ListRequest) => void;
  onOpenAlerts?: () => void;
  onOpenProfile?: () => void;
  onOpenMenu?: () => void;
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
            // The prefix covers the operations board too; `active` refetches only the visible one.
            queryClient.refetchQueries({ queryKey: DASHBOARD_KEY, type: 'active' }),
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
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <HomeHeader
          user={user}
          {...(onOpenProfile ? { onOpenProfile } : {})}
          {...(hasAlertsTab && onOpenAlerts ? { onOpenAlerts } : {})}
          {...(onOpenMenu ? { onOpenMenu } : {})}
        />

        <View style={{ gap: theme.spacing.section, padding: theme.spacing.screen }}>
          {status === 'offline' || !isOnline ? (
            <Banner
              tone="warning"
              title={status === 'offline' ? 'Working offline' : 'No connection'}
            >
              {status === 'offline'
                ? 'Your session could not be checked. What you see was loaded earlier, and nothing new will arrive until you are back on a connection.'
                : 'Lists will show what was last loaded. Pull down to try again once you are back on.'}
            </Banner>
          ) : null}

          {isClient ? (
            <ClientSummary onOpenApprovals={onOpenApprovals} onOpenApproval={onOpenApproval} />
          ) : (
            <InternalSummary
              onOpenApprovals={onOpenApprovals}
              {...(showProjects ? { onOpenProjects } : {})}
              {...(onOpenTask ? { onOpenTask } : {})}
              {...(onOpenTasks ? { onOpenTasks } : {})}
              {...(onOpenTicket ? { onOpenTicket } : {})}
              {...(onOpenTickets ? { onOpenTickets } : {})}
              {...(onOpenTaskList ? { onOpenTaskList } : {})}
              {...(onOpenTicketList ? { onOpenTicketList } : {})}
              {...(hasAlertsTab && onOpenAlerts ? { onOpenAlerts } : {})}
            />
          )}

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title="Go to" icon="grid-outline" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              {showProjects ? (
                <NavigationRow
                  layout="tile"
                  label="Projects"
                  icon="folder-open"
                  iconTone="info"
                  description="Where each project stands and who is on it."
                  onPress={onOpenProjects}
                />
              ) : null}

              {showApprovals ? (
                <NavigationRow
                  layout="tile"
                  label="Approvals"
                  icon="shield-checkmark"
                  iconTone="success"
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
                  icon="ribbon"
                  iconTone="orange"
                  description="Changes your team has finished, for you to try and answer."
                  onPress={onOpenSignOffs}
                />
              ) : null}

              {showChat ? (
                <NavigationRow
                  layout="tile"
                  label="Messages"
                  icon="chatbubbles"
                  iconTone="violet"
                  description="Internal conversations on your projects, tasks and tickets."
                  onPress={onOpenConversations}
                />
              ) : null}

              {showQa ? (
                <NavigationRow
                  layout="tile"
                  label="Testing"
                  icon="flask"
                  iconTone="teal"
                  description="Your testing queue and the pass/fail form."
                  onPress={onOpenQa}
                />
              ) : null}

              {showMyTime ? (
                <NavigationRow
                  layout="tile"
                  label="My time"
                  icon="time"
                  iconTone="pink"
                  description="The hours you have logged, by the day you did them."
                  onPress={onOpenMyTime}
                />
              ) : null}
            </View>
          </View>

          <HomeFooter isClient={isClient} />
        </View>
      </ScrollView>
    </Screen>
  );
}
