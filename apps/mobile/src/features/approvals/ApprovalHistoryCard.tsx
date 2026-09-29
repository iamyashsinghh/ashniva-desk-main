import type { ApprovalHistoryEntry } from '@ashniva/types';
import { View } from 'react-native';

import { IconTile } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { approvalStatusIcon, approvalStatusLabel } from './approval-display';

/**
 * The trail behind a request.
 *
 * Rendered from whatever the API sent. The provider's DTO and the client's carry the same field
 * name and deliberately not the same rows — the client's history is built by an allow-list
 * mapper — so one component can draw both without either audience learning what the other was
 * told. Each entry says which side acted, as the web trail does, because "Changes requested by
 * Priya" means something different depending on whose Priya she is.
 */
export function ApprovalHistoryCard({
  history,
  clientSide = false,
}: {
  history: readonly ApprovalHistoryEntry[];
  /** Whether the reader is the client, which changes whose side is "you". */
  clientSide?: boolean;
}) {
  const theme = useTheme();
  // The trail is folded: it is secondary to what is being asked and what can be done, and it is
  // already on the device, so opening it is one tap and no request. An empty trail has nothing to
  // fold, so its one sentence stays in view.
  return (
    <Section
      title="History"
      icon="time-outline"
      count={history.length > 0 ? history.length : undefined}
      collapsible={history.length > 0}
      initiallyOpen={false}
    >
      {history.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has happened to this request yet.
        </AppText>
      ) : (
        history.map((entry, index) => {
          const mark = approvalStatusIcon(entry.toStatus);
          return (
            <View key={entry.id} style={{ gap: theme.spacing.sm }}>
              {index > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <IconTile name={mark.icon} tone={mark.tone} size={28} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText size="xs" tone="faint">
                    {entry.actor.name} · {formatDateTime(entry.createdAt)}
                  </AppText>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                    <AppText size="sm" weight="medium" style={{ flexShrink: 1 }}>
                      {approvalStatusLabel(entry.toStatus)}
                    </AppText>
                    <Pill
                      label={sideLabel(entry.side, clientSide)}
                      tone={entry.side === 'CLIENT' ? 'info' : 'neutral'}
                    />
                  </View>
                  {entry.comment ? <AppText size="sm">{entry.comment}</AppText> : null}
                </View>
              </View>
            </View>
          );
        })
      )}
    </Section>
  );
}

function sideLabel(side: ApprovalHistoryEntry['side'], clientSide: boolean): string {
  if (side === 'CLIENT') {
    return clientSide ? 'Your team' : 'Client';
  }
  return clientSide ? 'Provider' : 'Our team';
}
