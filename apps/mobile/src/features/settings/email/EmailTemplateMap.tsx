import {
  MESSAGE_TEMPLATE_LABELS,
  NOTIFICATION_TEMPLATE_MAP,
  NOTIFICATION_TYPE_LABELS,
  type MessageTemplate,
  type NotificationType,
} from '@ashniva/types';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';

const ENTRIES = Object.entries(NOTIFICATION_TEMPLATE_MAP) as [NotificationType, MessageTemplate][];

/**
 * Which events send an email. Read-only on purpose, as on the web: the mapping is an allow-list in
 * shared code, and each person chooses which of these reach them in Notification preferences.
 */
export function EmailTemplateMap() {
  return (
    <Section
      title="Which events send an email"
      icon="list-outline"
      collapsible
      initiallyOpen={false}
    >
      {ENTRIES.map(([type, template]) => (
        <KeyValueRow
          key={type}
          label={NOTIFICATION_TYPE_LABELS[type]}
          value={MESSAGE_TEMPLATE_LABELS[template]}
        />
      ))}
      <AppText size="xs" tone="muted">
        Anything not listed stays in the app. Each person chooses which of these reach them in
        Notification preferences.
      </AppText>
    </Section>
  );
}
