import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText, Button, Card, Divider, Screen } from '../../shared/components/primitives';
import {
  currentPushPermission,
  registerForPush,
  type PushPermission,
} from '../../shared/notifications/push-registration';
import { isSecureStorageAvailable } from '../../shared/storage/secure-store';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';

/**
 * You, and what the phone is allowed to do.
 *
 * Push permission is asked for from here rather than on launch. Asked at the wrong moment the
 * answer is usually no, and on both platforms no is permanent until somebody goes into system
 * settings — so the app asks when the person has come looking for it.
 *
 * Which notifications you receive, and when, is a per-account setting rather than a per-device
 * one: it is edited on the web and applies everywhere. This screen says so rather than showing a
 * second set of switches that would disagree with the first.
 */
export function ProfileScreen({ onOpenPreferences }: { onOpenPreferences: () => void }) {
  const theme = useTheme();
  const { user, signOut } = useSession();
  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [secureStorage, setSecureStorage] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void currentPushPermission().then(setPermission);
    void isSecureStorageAvailable().then(setSecureStorage);
  }, []);

  if (!user) {
    return null;
  }

  /**
   * Asks the platform, and stops there.
   *
   * The token used to be posted to `/notifications/devices`, which the API has never had; the
   * 404 was swallowed, so this screen went on saying alerts would arrive while nothing was
   * registered anywhere. Until the API has somewhere to put a device token, granting permission
   * is all this can honestly do — and the wording below says as much.
   */
  const enablePush = async () => {
    setBusy(true);
    try {
      setPermission((await registerForPush()).permission);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
        <Card>
          <AppText size="lg" weight="bold">
            {user.name}
          </AppText>
          <AppText tone="muted">{user.email}</AppText>
          <Divider />
          <AppText size="sm" tone="muted">
            {user.roleName}
            {user.isCustomRole ? ' (custom role)' : ''}
          </AppText>
          <AppText size="sm" tone="muted">
            {user.organization.name}
          </AppText>
        </Card>

        <Card>
          <AppText weight="medium">Notifications on this device</AppText>
          {permission === 'granted' ? (
            <AppText size="sm" tone="muted">
              This device is allowed to show alerts. Sending them to a phone is not built yet, and
              e-mail is not switched on for this deployment — your notifications are in the app.
            </AppText>
          ) : null}
          {permission === 'denied' ? (
            <AppText size="sm" tone="muted">
              Turned off. To change it, allow notifications for Ashniva Desk in your device settings
              — the app cannot ask again.
            </AppText>
          ) : null}
          {permission === 'unavailable' ? (
            <AppText size="sm" tone="muted">
              This device cannot receive push notifications.
            </AppText>
          ) : null}
          {permission === 'undetermined' ? (
            <>
              <AppText size="sm" tone="muted">
                Allow alerts now so this device is ready when pushed notifications arrive.
              </AppText>
              <Button
                label="Turn on notifications"
                loading={busy}
                onPress={() => void enablePush()}
              />
            </>
          ) : null}
        </Card>

        <Card>
          <AppText weight="medium">Which notifications you get</AppText>
          <AppText size="sm" tone="muted">
            Your channels and quiet hours apply to every device you are signed in on.
          </AppText>
          <Button
            label="Notification settings"
            variant="secondary"
            onPress={onOpenPreferences}
            accessibilityHint="Choose what you are told about, and when"
          />
        </Card>

        {secureStorage === false ? (
          <Card>
            <AppText weight="medium" tone="danger">
              This device cannot store your session securely
            </AppText>
            <AppText size="sm" tone="muted">
              You will be asked to sign in again each time you open the app. On Android this usually
              means the device has no screen lock set.
            </AppText>
          </Card>
        ) : null}

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label="Sign out"
            variant="danger"
            loading={signingOut}
            accessibilityHint="Ends your session on this device"
            onPress={() => {
              setSigningOut(true);
              void signOut().finally(() => setSigningOut(false));
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
