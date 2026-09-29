import {
  SLA_EVENT_KIND_LABELS,
  SLA_TARGET_STATUS_LABELS,
  type SlaEventSummary,
  type SlaTargetState,
  type TicketSla,
} from '@ashniva/types';
import { View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { KeyValueRow, MetaLine } from '../../../shared/components/data-display';
import { IconTile } from '../../../shared/components/Icon';
import { Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime, formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { describeRemaining, slaIcon } from '../sla-format';
import { ICON_TONES, slaTone } from '../ticket-display';

/**
 * One target: its state as a coloured tile and pill, the time left (or over) in words, and the
 * deadline under it. The colours are the theme's success, warning and danger, through the same
 * status-to-tone table the web uses.
 */
export function SlaTargetRow({ label, target }: { label: string; target: SlaTargetState }) {
  const theme = useTheme();
  const tone = slaTone(target.status);
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
      <IconTile name={slaIcon(target.status)} tone={ICON_TONES[tone]} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <AppText weight="medium" style={{ flexShrink: 1 }}>
            {label}
          </AppText>
          <Pill label={SLA_TARGET_STATUS_LABELS[target.status]} tone={tone} />
        </View>
        <AppText size="sm" tone={tone === 'danger' ? 'danger' : 'muted'} tabular>
          {describeRemaining(target)}
        </AppText>
        {target.dueAt && !target.metAt ? (
          <AppText size="xs" tone="faint">
            Due {formatDateTime(target.dueAt)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A ticket's SLA, exactly as the backend computed it, with its event history for staff.
 *
 * The events are asked for only when a policy applies: without one there is no history to have.
 */
export function TicketSlaCard({ ticketId, sla }: { ticketId: string; sla: TicketSla | null }) {
  const theme = useTheme();
  const events = useResource<SlaEventSummary[]>(
    ['tickets', ticketId, 'sla-events'],
    `/sla/tickets/${ticketId}/events`,
    { enabled: Boolean(sla) },
  );

  if (!sla) {
    return (
      <Section title="SLA" icon="speedometer-outline">
        <MetaLine icon="information-circle-outline">No SLA policy applies to this ticket.</MetaLine>
      </Section>
    );
  }

  const history = events.data ?? [];
  return (
    <Section
      title="SLA"
      icon="speedometer-outline"
      action={<Pill label={SLA_TARGET_STATUS_LABELS[sla.overall]} tone={slaTone(sla.overall)} />}
    >
      <SlaTargetRow label="First response" target={sla.firstResponse} />
      <SlaTargetRow label="Resolution" target={sla.resolution} />
      <Divider />
      <KeyValueRow label="Policy" value={sla.policy?.name ?? '—'} />
      {sla.isPaused || sla.pausedTotalMinutes > 0 ? (
        <KeyValueRow
          label="Paused"
          value={`${sla.isPaused ? `Since ${formatDateTime(sla.pausedSince) ?? '—'}` : 'Not now'}${
            sla.pausedTotalMinutes > 0 ? ` · ${formatMinutes(sla.pausedTotalMinutes)} in total` : ''
          }`}
        />
      ) : null}
      {history.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Divider />
          {history.map((event) => (
            <View key={event.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View
                style={{
                  backgroundColor: theme.colors.borderStrong,
                  borderRadius: 4,
                  height: 8,
                  marginTop: 6,
                  width: 8,
                }}
              />
              <View style={{ flex: 1 }}>
                <AppText size="sm">
                  {SLA_EVENT_KIND_LABELS[event.kind]}
                  {event.detail ? ` · ${event.detail}` : ''}
                </AppText>
                <AppText size="xs" tone="faint">
                  {formatDateTime(event.createdAt)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
}
