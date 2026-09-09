import { PERMISSIONS, isClientRole } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mobileEnv } from '../../config/env';
import { NavigationRow } from '../../shared/components/navigation-list';
import { AppText, Card, Screen } from '../../shared/components/primitives';
import { useNetworkStatus } from '../../shared/hooks/use-network-status';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { isProviderUser } from '../auth/audience';
import { canUseInternalChat } from '../chat/chat-access';
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
}: {
  onRefresh?: () => void;
  onOpenProjects: () => void;
  onOpenConversations: () => void;
  onOpenQa: () => void;
  onOpenApprovals: () => void;
  onOpenSignOffs: () => void;
  onOpenMyTime: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, status, can } = useSession();
  const { isOnline } = useNetworkStatus();
  const waiting = useClientWaiting(user);

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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              onRefresh?.();
              waiting.refresh();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={{ gap: theme.spacing.xs }}>
          <AppText size="xl" weight="bold">
            {greeting()}, {user.name.split(' ')[0]}
          </AppText>
          <AppText tone="muted">
            {user.roleName} · {user.organization.name}
          </AppText>
        </View>

        {status === 'offline' ? (
          <Card>
            <AppText weight="medium">Working offline</AppText>
            <AppText size="sm" tone="muted">
              Your session could not be checked. What you see was loaded earlier, and nothing new
              will arrive until you are back on a connection.
            </AppText>
          </Card>
        ) : null}

        {showProjects ? (
          <NavigationRow
            label="Projects"
            description="Where each project stands and who is on it."
            onPress={onOpenProjects}
          />
        ) : null}

        {showApprovals ? (
          <NavigationRow
            label="Approvals"
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
            label="Sign-offs"
            description="Changes your team has finished, for you to try and answer."
            onPress={onOpenSignOffs}
          />
        ) : null}

        {showChat ? (
          <NavigationRow
            label="Messages"
            description="Internal conversations on your projects, tasks and tickets."
            onPress={onOpenConversations}
          />
        ) : null}

        {showQa ? (
          <NavigationRow
            label="Testing"
            description="Your testing queue and the pass/fail form."
            onPress={onOpenQa}
          />
        ) : null}

        {showMyTime ? (
          <NavigationRow
            label="My time"
            description="The hours you have logged, by the day you did them."
            onPress={onOpenMyTime}
          />
        ) : null}

        <Card>
          <AppText weight="medium">{isClient ? 'What you can do here' : 'On your phone'}</AppText>
          <AppText size="sm" tone="muted">
            {isClient
              ? 'Raise a ticket, follow the ones you have open, approve what your team sends you, read what has been published, and check an invoice.'
              : 'Your tasks, the tickets you are on, approvals, your logged time, and what needs your attention. Everything else — reports, administration, billing setup — is on the web app.'}
          </AppText>
        </Card>

        {!isOnline ? (
          <Card>
            <AppText weight="medium">No connection</AppText>
            <AppText size="sm" tone="muted">
              Lists will show what was last loaded. Pull down to try again once you are back on.
            </AppText>
          </Card>
        ) : null}

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
