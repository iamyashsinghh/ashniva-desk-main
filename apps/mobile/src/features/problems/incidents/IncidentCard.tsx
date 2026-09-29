import {
  EMERGENCY_FIX_STATUS,
  EMERGENCY_FIX_STATUS_LABELS,
  INCIDENT_STATUS_LABELS,
  isIncidentEnded,
  PRIORITY,
  PRIORITY_LABELS,
  type IncidentSummary,
} from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatMinutes, formatSince } from '../../../shared/format/format';
import {
  EMERGENCY_FIX_TONE,
  incidentTone,
  SEVERITY_ICON_TONE,
  SEVERITY_TONE,
} from '../problem-display';

/**
 * One incident in the list. How long it has been going on is the number that matters while it
 * is live, so it sits on the card; an emergency fix waiting for a decision is called out too.
 */
export function IncidentCard({
  incident,
  onPress,
}: {
  incident: IncidentSummary;
  onPress: () => void;
}) {
  const live = !isIncidentEnded(incident.status);
  return (
    <PressableCard
      accessibilityLabel={`${incident.key} ${incident.title}`}
      accessibilityHint="Opens the incident"
      onPress={onPress}
      icon="flame-outline"
      iconTone={SEVERITY_ICON_TONE[incident.severity]}
      highlight={live && incident.severity === PRIORITY.CRITICAL}
    >
      <MetaLine icon="pricetag-outline">
        {incident.key}
        {incident.project ? ` · ${incident.project.name}` : ''}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {incident.title}
      </AppText>
      <PillRow>
        <Pill
          label={INCIDENT_STATUS_LABELS[incident.status]}
          tone={incidentTone(incident.status)}
        />
        <Pill label={PRIORITY_LABELS[incident.severity]} tone={SEVERITY_TONE[incident.severity]} />
        {incident.emergencyFixStatus !== EMERGENCY_FIX_STATUS.NONE ? (
          <Pill
            label={`Emergency fix ${EMERGENCY_FIX_STATUS_LABELS[incident.emergencyFixStatus].toLowerCase()}`}
            tone={EMERGENCY_FIX_TONE[incident.emergencyFixStatus]}
          />
        ) : null}
      </PillRow>
      {incident.impact ? (
        <AppText size="sm" tone="muted" numberOfLines={2}>
          {incident.impact}
        </AppText>
      ) : null}
      <MetaLine icon="time-outline">
        {live ? 'Going for ' : 'Lasted '}
        {formatMinutes(incident.durationMinutes)}
        {` · started ${formatSince(incident.startedAt) ?? ''}`}
      </MetaLine>
      {incident.owner ? <MetaLine icon="person-outline">{incident.owner.name}</MetaLine> : null}
    </PressableCard>
  );
}
