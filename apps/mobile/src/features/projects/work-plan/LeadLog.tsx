import {
  extraSeconds,
  WORK_PLAN_EVENT_KIND,
  WORK_PLAN_EVENT_KIND_LABELS,
  type WorkPlanEventKind,
  type WorkPlanPoint,
  type WorkPlanPointEvent,
} from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { formatSpan, liveRemainingSeconds } from './plan-helpers';
import { useTicker } from './use-ticker';

/**
 * Admin / PM / TL detail on one step: assigned time, time past the estimate (live until Good),
 * and every start, stop, send and tester verdict. The API only sends the trail to those roles.
 */
export function LeadLog({ point }: { point: WorkPlanPoint }) {
  const theme = useTheme();
  const live = Boolean(point.startedAt) && !point.completedAt && !point.timerPaused;
  const now = useTicker(live && !point.isError);
  const extra = live
    ? extraSeconds(point.overrunSeconds, point.dueAt, new Date(now), point.completedAt, null)
    : point.extraSeconds;
  const remaining = liveRemainingSeconds(point, now);
  const under =
    point.completedAt && !point.isError && extra <= 0
      ? (point.pausedRemainingSeconds ?? remaining)
      : 0;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      }}
    >
      <View>
        <KeyValueRow
          label="Assigned time"
          value={point.isError ? 'error' : `${point.estimateMinutes} min`}
        />
        <KeyValueRow
          label="Extra"
          value={extraText(point, extra)}
          {...(extra > 0 ? { tone: 'danger' as const } : {})}
        />
        {under > 0 ? (
          <KeyValueRow label="Finished early" value={`${formatSpan(under)} under`} tone="success" />
        ) : null}
        <KeyValueRow label="Assigned" value={formatDateTime(point.assignedAt) ?? '—'} />
        <KeyValueRow label="Started" value={formatDateTime(point.startedAt) ?? '—'} />
        {point.completedAt ? (
          <KeyValueRow label="Completed" value={formatDateTime(point.completedAt) ?? '—'} />
        ) : null}
        {point.startedBy ? <KeyValueRow label="Developer" value={point.startedBy.name} /> : null}
      </View>
      {point.events.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="label" tone="muted" uppercase>
            {timelineSummary(point.events)}
          </AppText>
          {point.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function extraText(point: WorkPlanPoint, extra: number): string {
  if (point.isError || !point.startedAt) {
    return '—';
  }
  if (extra <= 0) {
    return '0 min';
  }
  return `${formatSpan(extra)} more${point.completedAt ? '' : ' · counting'}`;
}

function timelineSummary(events: readonly WorkPlanPointEvent[]): string {
  const count = (kinds: WorkPlanEventKind[]) =>
    events.filter((event) => kinds.includes(event.kind)).length;
  const starts = count([WORK_PLAN_EVENT_KIND.STARTED, WORK_PLAN_EVENT_KIND.RESUMED]);
  const stops = count([WORK_PLAN_EVENT_KIND.STOPPED]);
  const sends = count([WORK_PLAN_EVENT_KIND.SENT_TO_TESTER]);
  return [
    `Timeline · started ${starts}×`,
    stops > 0 ? `stopped ${stops}×` : null,
    sends > 0 ? `sent to tester ${sends}×` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const EVENT_ICONS: Record<
  WorkPlanEventKind,
  { name: IconName; tone: 'info' | 'warning' | 'danger' | 'success' | 'muted' }
> = {
  STARTED: { name: 'play', tone: 'info' },
  RESUMED: { name: 'play-forward', tone: 'info' },
  STOPPED: { name: 'pause', tone: 'muted' },
  SENT_TO_TESTER: { name: 'paper-plane', tone: 'warning' },
  ERROR: { name: 'arrow-undo', tone: 'danger' },
  PASSED: { name: 'checkmark-circle', tone: 'success' },
};

function EventRow({ event }: { event: WorkPlanPointEvent }) {
  const theme = useTheme();
  const icon = EVENT_ICONS[event.kind];
  const color = icon.tone === 'muted' ? theme.colors.textMuted : theme.colors[icon.tone];
  const sent = event.kind === WORK_PLAN_EVENT_KIND.SENT_TO_TESTER;
  const stopped = event.kind === WORK_PLAN_EVENT_KIND.STOPPED;
  const started =
    event.kind === WORK_PLAN_EVENT_KIND.STARTED || event.kind === WORK_PLAN_EVENT_KIND.RESUMED;
  const verdict = !sent && !started && !stopped;
  const facts = [
    event.actor.name,
    sent || stopped ? `${formatSpan(event.elapsedSeconds)} after start` : null,
    started && event.elapsedSeconds > 0 ? `${formatSpan(event.elapsedSeconds)} into task` : null,
    verdict && event.sinceSubmitSeconds !== null
      ? `tester took ${formatSpan(event.sinceSubmitSeconds)}`
      : null,
    event.extraSeconds > 0 ? `${formatSpan(event.extraSeconds)} extra` : null,
    event.body && (stopped || started) ? event.body : null,
  ].filter(Boolean);

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <Icon name={icon.name} size={14} color={color} style={{ marginTop: 3 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="sm" weight="medium">
          {WORK_PLAN_EVENT_KIND_LABELS[event.kind]} · {formatDateTime(event.createdAt)}
        </AppText>
        <AppText size="xs" tone="muted">
          {facts.join(' · ')}
        </AppText>
        {verdict && event.kind === WORK_PLAN_EVENT_KIND.ERROR && event.body ? (
          <AppText size="sm">{event.body}</AppText>
        ) : null}
      </View>
    </View>
  );
}
