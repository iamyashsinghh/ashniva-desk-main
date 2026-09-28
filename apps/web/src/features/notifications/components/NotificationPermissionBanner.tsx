import { Alert, Button } from '@ashniva/ui';
import { useEffect, useState } from 'react';

import { unlockNotificationAttention } from '../notify-attention';

/**
 * Soft prompt when the browser has not granted notification permission yet.
 *
 * Without it, alerts stay inside the Ashniva tab — other Chrome tabs and other apps stay quiet.
 */
export function NotificationPermissionBanner() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      return undefined;
    }
    const sync = () => setPermission(Notification.permission);
    sync();
    // Some browsers expose a permission change event via the Permissions API.
    let status: PermissionStatus | undefined;
    void navigator.permissions?.query({ name: 'notifications' as PermissionName }).then((result) => {
      status = result;
      result.onchange = sync;
    });
    return () => {
      if (status) {
        status.onchange = null;
      }
    };
  }, []);

  if (dismissed || permission === 'unsupported' || permission === 'granted') {
    return null;
  }

  return (
    <div className="notification-permission-banner">
      <Alert
        tone="info"
        title="Turn on desktop notifications"
        dismissLabel="Dismiss notification permission prompt"
        onDismiss={() => setDismissed(true)}
      >
        Allow notifications so alerts reach you on other tabs, other apps, and your phone — even
        when every Ashniva tab is closed.
        {permission === 'default' ? (
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                unlockNotificationAttention();
                void Notification.requestPermission().then((next) => {
                  setPermission(next);
                  if (next === 'granted') {
                    void import('../push-subscribe').then(({ ensureWebPushSubscription }) =>
                      ensureWebPushSubscription(),
                    );
                  }
                });
              }}
            >
              Allow notifications
            </Button>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            Notifications are blocked for this site. Enable them in the browser address-bar
            settings, then reload.
          </p>
        )}
      </Alert>
    </div>
  );
}
