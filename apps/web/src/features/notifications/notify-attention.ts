import { playMessageSound, unlockMessageSound } from '../communication/message-sound';
import { ensureWebPushSubscription } from './push-subscribe';

/**
 * Makes every in-app notification audible and visible outside the Ashniva tab — other Chrome
 * tabs, other apps, phone lock screen — and registers Web Push so alerts still arrive when every
 * tab is closed.
 */

let permissionAsked = false;
let workerRegistered = false;

/** Call from the first click/tap/key so later pings and permission prompts are allowed. */
export function unlockNotificationAttention(): void {
  unlockMessageSound();
  void ensureNotificationWorker();
  if (permissionAsked || typeof Notification === 'undefined') {
    void ensureWebPushSubscription();
    return;
  }
  permissionAsked = true;
  if (Notification.permission === 'default') {
    void Notification.requestPermission()
      .then(() => ensureWebPushSubscription())
      .catch(() => {
        // Refusal is fine — in-app toast + badge still work.
      });
  } else if (Notification.permission === 'granted') {
    void ensureWebPushSubscription();
  }
}

export function wireNotificationAttentionUnlock(): () => void {
  void ensureNotificationWorker();
  void ensureWebPushSubscription();
  const onGesture = () => unlockNotificationAttention();
  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);
  window.addEventListener('touchstart', onGesture, { passive: true });
  return () => {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
    window.removeEventListener('touchstart', onGesture);
  };
}

async function ensureNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    if (!workerRegistered) {
      await navigator.serviceWorker.register('/notification-sw.js');
      workerRegistered = true;
    }
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Whether the person is already looking at the thing this notification points at.
 *
 * Only then do we stay quiet on the OS side — a second banner over the open task is noise. Any
 * other tab, window, or app means the OS banner should fire.
 */
export function isViewingNotificationTarget(link: string | null | undefined): boolean {
  if (!link || typeof document === 'undefined') {
    return false;
  }
  if (document.hidden || !document.hasFocus()) {
    return false;
  }
  try {
    const path = new URL(link, window.location.origin).pathname;
    return window.location.pathname === path;
  } catch {
    return window.location.pathname === link;
  }
}

/**
 * Ping + OS notification for one delivery.
 *
 * Sound always (when the browser has unlocked audio). The system banner fires unless they are
 * already focused on that link — so another Chrome tab, another app, or the phone home screen
 * still get a proper alert. When the tab is closed entirely, Web Push covers the same path.
 */
export function announceNotification(input: {
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string;
}): void {
  playMessageSound();
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }
  if (isViewingNotificationTarget(input.link)) {
    return;
  }
  void showOsNotification(input);
}

async function showOsNotification(input: {
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string;
}): Promise<void> {
  const options: NotificationOptions & { requireInteraction?: boolean } = {
    body: input.body ?? undefined,
    tag: input.tag ?? input.title,
    data: { link: input.link ?? '/' },
    // Keep the banner around until they act — background tabs often miss a short flash.
    requireInteraction: true,
  };
  try {
    const registration = await ensureNotificationWorker();
    if (registration?.showNotification) {
      await registration.showNotification(input.title, options);
      return;
    }
    const notice = new Notification(input.title, options);
    notice.onclick = () => {
      window.focus();
      if (input.link) {
        window.location.assign(input.link);
      }
      notice.close();
    };
  } catch {
    // Unsupported options / missing SW — try the plain constructor once.
    try {
      new Notification(input.title, {
        body: input.body ?? undefined,
        tag: input.tag,
      });
    } catch {
      // Permission revoked mid-flight or WebView without Notification — badge still updates.
    }
  }
}
