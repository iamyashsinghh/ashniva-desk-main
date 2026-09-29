import {
  INCIDENT_STATUS_LABELS,
  isIncidentEnded,
  PRIORITY_LABELS,
  type IncidentDetail,
} from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { Hero } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatMinutes } from '../../../shared/format/format';
import { incidentTone, SEVERITY_ICON_TONE, SEVERITY_TONE } from '../problem-display';

/** The top of an incident: what it is, how bad, and how long it has been going on. */
export function IncidentHero({ incident }: { incident: IncidentDetail }) {
  const ended = isIncidentEnded(incident.status);
  return (
    <Hero
      overline={`${incident.key} · internal — clients see only a published summary`}
      title={incident.title}
      icon="flame-outline"
      iconTone={SEVERITY_ICON_TONE[incident.severity]}
    >
      <PillRow>
        <Pill
          label={INCIDENT_STATUS_LABELS[incident.status]}
          tone={incidentTone(incident.status)}
        />
        <Pill label={PRIORITY_LABELS[incident.severity]} tone={SEVERITY_TONE[incident.severity]} />
      </PillRow>
      <MetaLine icon="time-outline">
        {ended ? 'Lasted ' : 'Going for '}
        {formatMinutes(incident.durationMinutes)}
      </MetaLine>
      {incident.project || incident.product ? (
        <MetaLine icon="folder-outline">
          {[incident.project?.name, incident.product?.name].filter(Boolean).join(' · ')}
        </MetaLine>
      ) : null}
      {incident.impact ? (
        <AppText size="sm" tone="muted">
          Impact: {incident.impact}
        </AppText>
      ) : null}
    </Hero>
  );
}
