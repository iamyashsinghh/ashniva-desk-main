import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { MetaLine } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useRoleHistory } from './roles-api';

/**
 * Who changed this role, and when. Folded by default and only fetched once opened: the
 * collapsed section does not mount its body, so the history costs nothing until it is wanted.
 */
export function RoleHistory({ roleId }: { roleId: string }) {
  return (
    <Section title="History" icon="time-outline" collapsible initiallyOpen={false}>
      <HistoryEntries roleId={roleId} />
    </Section>
  );
}

function HistoryEntries({ roleId }: { roleId: string }) {
  const theme = useTheme();
  const history = useRoleHistory(roleId);
  if (history.error) {
    return (
      <AppText size="sm" tone="danger">
        {errorMessage(history.error)}
      </AppText>
    );
  }
  if (!history.data) {
    return (
      <AppText size="sm" tone="muted">
        Loading history…
      </AppText>
    );
  }
  if (history.data.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        No changes recorded yet.
      </AppText>
    );
  }
  return (
    <View style={{ gap: theme.spacing.md }}>
      {history.data.map((entry) => (
        <View key={entry.id} style={{ gap: 2 }}>
          <AppText size="sm" weight="medium">
            {entry.action}
          </AppText>
          <MetaLine icon="person-outline">
            {`${entry.actor?.name ?? 'System'} · ${formatDateTime(entry.createdAt) ?? ''}`}
          </MetaLine>
        </View>
      ))}
    </View>
  );
}
