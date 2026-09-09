import {
  MESSAGE_TEMPLATE_LABELS,
  NOTIFICATION_TEMPLATE_MAP,
  NOTIFICATION_TYPE_LABELS,
  type MessageTemplate,
  type NotificationType,
} from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';

/**
 * Which events send a message on this channel.
 *
 * Read-only, and deliberately so: the mapping is an allow-list in shared code, checked at
 * compile time against the notification types. An event that is not listed stays in the app.
 * People choose which of these reach them in Notification preferences, per type and per channel.
 */
export function EmailTemplateMap() {
  const entries = Object.entries(NOTIFICATION_TEMPLATE_MAP) as [
    NotificationType,
    MessageTemplate,
  ][];

  return (
    <Card title="Which events send an email">
      <ul className="messaging-templates">
        {entries.map(([type, template]) => (
          <li key={type}>
            <span>{NOTIFICATION_TYPE_LABELS[type]}</span>
            <Badge tone="neutral">{MESSAGE_TEMPLATE_LABELS[template]}</Badge>
          </li>
        ))}
      </ul>
      <p className="muted">
        Anything not listed stays in the app. Each person chooses which of these reach them in
        Notification preferences.
      </p>
    </Card>
  );
}
