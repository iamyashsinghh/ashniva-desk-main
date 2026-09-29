import { NOTIFICATION_TYPE_LABELS, type NotificationSummary } from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';

/** First match wins, so the more specific words come before the words they contain. */
const ICON_RULES: readonly [RegExp, IconName][] = [
  [/sign-?off|uat/, 'ribbon-outline'],
  [/approval/, 'shield-checkmark-outline'],
  [/ticket/, 'ticket-outline'],
  [/task|phase|work_plan/, 'checkbox-outline'],
  [/conversation|message|chat|mention/, 'chatbubble-ellipses-outline'],
  [/invoice|billing/, 'receipt-outline'],
  [/release/, 'rocket-outline'],
  [/qa|test/, 'flask-outline'],
  [/project|milestone/, 'folder-open-outline'],
];

export function notificationIcon(item: NotificationSummary): IconName {
  const hint = `${item.type} ${item.entityType ?? ''} ${item.link ?? ''}`.toLowerCase();
  return ICON_RULES.find(([pattern]) => pattern.test(hint))?.[1] ?? 'notifications-outline';
}

/**
 * The type as a reader would say it — the same wording the web inbox and the preferences screen
 * use. A type newer than this build falls back to its own words rather than showing a constant.
 */
export function notificationTypeLabel(type: string): string {
  const label = (NOTIFICATION_TYPE_LABELS as Record<string, string | undefined>)[type];
  if (label) {
    return label;
  }
  const words = type.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
