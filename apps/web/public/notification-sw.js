/* Web Push + click handling so OS notifications work with the tab closed or in the background. */

self.addEventListener('push', (event) => {
  let payload = { title: 'Ashniva Desk', body: '', link: '/', tag: 'ashniva' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // Non-JSON payloads still show a generic banner.
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // An open focused Ashniva tab already gets Socket.IO + in-app toast/sound — skip a duplicate
      // OS banner. Hidden or closed tabs (and no clients at all) still need the push banner.
      const focused = clients.some((client) => 'focused' in client && client.focused);
      if (focused) {
        return undefined;
      }
      return self.registration.showNotification(payload.title || 'Ashniva Desk', {
        body: payload.body || undefined,
        tag: payload.tag || 'ashniva',
        data: { link: payload.link || '/' },
        requireInteraction: true,
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link =
    (event.notification.data && event.notification.data.link) ||
    event.notification.data?.url ||
    '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'ashniva-notification-click', link });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
      return undefined;
    }),
  );
});
