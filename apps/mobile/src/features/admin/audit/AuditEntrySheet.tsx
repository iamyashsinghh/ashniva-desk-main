import type { AuditLogEntrySummary } from '@ashniva/types';
import { Platform, View } from 'react-native';

import { KeyValueRow } from '../../../shared/components/data-display';
import { AppText } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { entityTypeLabel, formatSnapshot } from './audit-display';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * One audit entry in full: the fields the web's table shows, plus what the row alone cannot —
 * the company, the address it came from, the request id to find it in the server logs, and the
 * before and after snapshots.
 */
export function AuditEntrySheet({
  entry,
  onClose,
}: {
  entry: AuditLogEntrySummary | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={entry !== null}
      title={entry?.action ?? ''}
      {...(entry ? { subtitle: entityTypeLabel(entry.entityType) } : {})}
      onClose={onClose}
    >
      {entry ? <EntryDetails entry={entry} /> : null}
    </Sheet>
  );
}

function EntryDetails({ entry }: { entry: AuditLogEntrySummary }) {
  const before = formatSnapshot(entry.before);
  const after = formatSnapshot(entry.after);
  return (
    <>
      <View>
        <KeyValueRow label="When" value={formatDateTime(entry.createdAt) ?? '—'} />
        <KeyValueRow label="Who" value={entry.actor ? entry.actor.name : 'System'} />
        {entry.actor ? <KeyValueRow label="Email" value={entry.actor.email} /> : null}
        <KeyValueRow label="Company" value={entry.organization?.name ?? '—'} />
        <KeyValueRow label="Type" value={entityTypeLabel(entry.entityType)} />
        <KeyValueRow label="Record" value={entry.entityId ?? '—'} />
        <KeyValueRow label="IP address" value={entry.ipAddress ?? '—'} />
        <KeyValueRow label="Request" value={entry.requestId ?? '—'} />
      </View>
      {before ? <Snapshot title="Before" text={before} /> : null}
      {after ? <Snapshot title="After" text={after} /> : null}
    </>
  );
}

function Snapshot({ title, text }: { title: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" tone="muted" uppercase>
        {title}
      </AppText>
      <View
        style={{
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.sm + 2,
          padding: theme.spacing.md,
        }}
      >
        <AppText size="xs" style={{ fontFamily: MONOSPACE }}>
          {text}
        </AppText>
      </View>
    </View>
  );
}
