import type { RcaAction } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { SectionHeader } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const KIND_LABELS: Record<RcaAction['kind'], string> = {
  CORRECTIVE: 'Corrective',
  PREVENTIVE: 'Preventive',
};

/**
 * The corrective and preventive actions the analysis produced. Each points at the task doing the
 * work rather than being a second to-do list, so what is shown is the link and where it stands.
 */
export function RcaActions({ actions }: { actions: readonly RcaAction[] }) {
  const theme = useTheme();
  if (actions.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Corrective & preventive actions" count={actions.length} />
      {actions.map((action) => (
        <View key={action.id} style={{ gap: 4 }}>
          <AppText>{action.description}</AppText>
          <PillRow>
            <Pill label={KIND_LABELS[action.kind]} tone="info" />
            {action.completedAt || action.verifiedAt ? (
              <Pill label={action.verifiedAt ? 'Verified' : 'Done'} tone="success" />
            ) : null}
          </PillRow>
          <MetaLine icon="person-outline">
            {action.owner?.name ?? 'No owner'}
            {action.dueDate ? ` · due ${formatDate(action.dueDate) ?? ''}` : ''}
            {action.task ? ` · ${action.task.key}` : ''}
          </MetaLine>
        </View>
      ))}
    </View>
  );
}
