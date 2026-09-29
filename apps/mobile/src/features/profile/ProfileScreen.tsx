import { ROLE_LABELS } from '@ashniva/types';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ListRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import type { IconTone } from '../../shared/components/Icon';
import { SectionHeader } from '../../shared/components/layout';
import { Button, Card, Divider, Screen } from '../../shared/components/primitives';
import {
  currentPushPermission,
  registerForPush,
  type PushPermission,
} from '../../shared/notifications/push-registration';
import { isSecureStorageAvailable } from '../../shared/storage/secure-store';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { OrganizationRows } from './OrganizationRows';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePictureSheet } from './ProfilePictureSheet';
import { WorkScheduleCard } from './WorkScheduleCard';

/**
 * You, and what the phone is allowed to do.
 *
 * Push permission is asked for from here rather than on launch. Asked at the wrong moment the
 * answer is usually no, and on both platforms no is permanent until somebody goes into system
 * settings — so the app asks when the person has come looking for it.
 *
 * Which notifications you receive, and when, is a per-account setting rather than a per-device
 * one, so the settings row says it applies everywhere.
 */
export function ProfileScreen({
  onOpenPreferences,
  onChangePassword,
  onOpenChatWallpaper,
  onOpenMenu,
}: {
  onOpenPreferences: () => void;
  /** Opens the change-password screen. The row is left out until the navigator provides it. */
  onChangePassword?: () => void;
  /** Opens the chat wallpaper picker. The row is left out until the navigator provides it. */
  onOpenChatWallpaper?: () => void;
  onOpenMenu?: () => void;
}) {
  const theme = useTheme();
  const { user, signOut } = useSession();
  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [secureStorage, setSecureStorage] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editingPicture, setEditingPicture] = useState(false);

  useEffect(() => {
    void currentPushPermission().then(setPermission);
    void isSecureStorageAvailable().then(setSecureStorage);
  }, []);

  if (!user) {
    return null;
  }

  const enablePush = async () => {
    setBusy(true);
    try {
      setPermission((await registerForPush()).permission);
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = user.roleName || ROLE_LABELS[user.roleKey];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}>
        <ProfileHeader
          user={user}
          onEditPicture={() => setEditingPicture(true)}
          {...(onOpenMenu ? { onOpenMenu } : {})}
        />

        <View
          style={{
            gap: theme.spacing.md,
            marginTop: -(theme.spacing.xxl - 4),
            paddingHorizontal: theme.spacing.screen,
          }}
        >
          <Card style={{ gap: 0, paddingVertical: theme.spacing.sm }}>
            <ListRow
              icon="shield-half-outline"
              iconTone="violet"
              title={`${roleLabel}${user.isCustomRole ? ' (custom role)' : ''}`}
              subtitle="Your role"
            />
            {user.title ? (
              <>
                <Divider inset={48} />
                <ListRow
                  icon="briefcase-outline"
                  iconTone="orange"
                  title={user.title}
                  subtitle="Job title"
                />
              </>
            ) : null}
            <Divider inset={48} />
            <OrganizationRows user={user} />
          </Card>

          {secureStorage === false ? (
            <Banner tone="danger" title="This device cannot store your session securely">
              You will be asked to sign in again each time you open the app. On Android this usually
              means the device has no screen lock set.
            </Banner>
          ) : null}

          {onChangePassword ? (
            <Card style={{ gap: 0, paddingVertical: theme.spacing.xs }}>
              <ListRow
                icon="key-outline"
                iconTone="warning"
                title="Change password"
                subtitle="Signs you out on every other device"
                onPress={onChangePassword}
              />
            </Card>
          ) : null}

          <WorkScheduleCard />

          {onOpenChatWallpaper ? (
            <Card style={{ gap: 0, paddingVertical: theme.spacing.xs }}>
              <ListRow
                icon="image-outline"
                iconTone="teal"
                title="Chat wallpaper"
                subtitle="The picture or colour behind your conversations, on this device"
                onPress={onOpenChatWallpaper}
              />
            </Card>
          ) : null}

          <Card style={{ gap: 0 }}>
            <SectionHeader title="Which notifications you get" icon="notifications-outline" />
            <ListRow
              icon="options-outline"
              title="Notification settings"
              subtitle="Your channels and quiet hours apply to every device you are signed in on."
              onPress={onOpenPreferences}
              accessibilityHint="Choose what you are told about, and when"
            />
            <Divider inset={48} />
            <ListRow
              icon="phone-portrait-outline"
              iconTone={PUSH_TONE[permission]}
              title="Notifications on this device"
              subtitle={PUSH_STATUS[permission]}
            />
            {permission === 'undetermined' ? (
              <Button
                label="Turn on notifications"
                icon="notifications"
                loading={busy}
                onPress={() => void enablePush()}
              />
            ) : null}
          </Card>

          <Card style={{ gap: 0, paddingVertical: theme.spacing.xs }}>
            <ListRow
              icon="log-out-outline"
              iconTone="danger"
              title={signingOut ? 'Signing out…' : 'Sign out'}
              subtitle="Ends your session on this device"
              destructive
              accessibilityLabel="Sign out"
              accessibilityHint="Ends your session on this device"
              onPress={() => {
                if (signingOut) {
                  return;
                }
                setSigningOut(true);
                void signOut().finally(() => setSigningOut(false));
              }}
            />
          </Card>
        </View>
      </ScrollView>
      <ProfilePictureSheet
        visible={editingPicture}
        user={user}
        onClose={() => setEditingPicture(false)}
      />
    </Screen>
  );
}

const PUSH_TONE: Record<PushPermission, IconTone> = {
  granted: 'success',
  denied: 'danger',
  unavailable: 'neutral',
  undetermined: 'warning',
};

/** What the platform has said about alerts on this device, in words. */
const PUSH_STATUS: Record<PushPermission, string> = {
  granted:
    'This device is allowed to show alerts. Choose which ones arrive here under Notification settings.',
  denied:
    'Turned off. To change it, allow notifications for Ashniva Desk in your device settings — the app cannot ask again.',
  unavailable: 'This device cannot receive push notifications.',
  undetermined: 'Allow alerts now so this device can show the notifications you choose.',
};
