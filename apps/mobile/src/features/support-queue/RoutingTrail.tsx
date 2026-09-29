import {
  ROUTING_ROLE_LABELS,
  ROUTING_SKIP_REASON_LABELS,
  type RoutingTrailRow,
} from '@ashniva/types';
import { View } from 'react-native';

import { IconTile } from '../../shared/components/Icon';
import { AppText, Pill } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { trailAttempts } from './support-display';

/**
 * Every candidate the router considered, in the order it considered them, one block per attempt.
 * The rows are never edited, so an earlier attempt still shows the reasons that applied then.
 */
export function RoutingTrail({ rows }: { rows: readonly RoutingTrailRow[] }) {
  const theme = useTheme();
  if (rows.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        No routing decisions have been recorded for this ticket.
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {trailAttempts(rows).map((attempt) => (
        <View key={attempt.attempt} style={{ gap: theme.spacing.sm }}>
          <AppText variant="label" tone="muted" uppercase>
            Attempt {attempt.attempt} · policy v{attempt.policyVersion}
          </AppText>
          {attempt.rows.map((row) => (
            <View
              key={row.id}
              style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
            >
              <IconTile
                name={row.accepted ? 'checkmark' : 'close'}
                tone={row.accepted ? 'success' : 'neutral'}
                size={28}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="sm" weight="medium">
                  {row.user?.name ?? 'Nobody configured'}
                </AppText>
                <AppText size="xs" tone="muted">
                  {ROUTING_ROLE_LABELS[row.role]}
                </AppText>
              </View>
              <Pill
                label={
                  row.accepted
                    ? 'Chosen'
                    : (row.skipReason && ROUTING_SKIP_REASON_LABELS[row.skipReason]) || 'Skipped'
                }
                tone={row.accepted ? 'success' : 'neutral'}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
