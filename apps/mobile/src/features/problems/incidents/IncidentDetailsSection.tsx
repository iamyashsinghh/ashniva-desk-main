import { PERMISSIONS, type IncidentDetail } from '@ashniva/types';

import { KeyValueRow, ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';

/** When it started, was noticed and ended; who owns it; the problem behind it; internal notes. */
export function IncidentDetailsSection({
  incident,
  onOpenProblem,
}: {
  incident: IncidentDetail;
  onOpenProblem?: (problemId: string) => void;
}) {
  const { can } = useSession();
  const { problemId } = incident;
  return (
    <Section title="Details" icon="information-circle-outline">
      <KeyValueRow label="Started" value={formatDateTime(incident.startedAt) ?? '—'} />
      <KeyValueRow label="Detected" value={formatDateTime(incident.detectedAt) ?? '—'} />
      <KeyValueRow
        label="Resolved"
        value={incident.resolvedAt ? (formatDateTime(incident.resolvedAt) ?? '—') : '—'}
      />
      <KeyValueRow label="Owner" value={incident.owner?.name ?? 'Unassigned'} />
      {problemId && onOpenProblem && can(PERMISSIONS.PROBLEM_READ) ? (
        <ListRow
          icon="bug-outline"
          iconTone="danger"
          title="The recurring fault behind it"
          subtitle="Problem"
          onPress={() => onOpenProblem(problemId)}
        />
      ) : (
        <KeyValueRow label="Problem" value={problemId ? 'Linked' : '—'} />
      )}
      {incident.internalNotes ? (
        <AppText size="sm">
          <AppText size="sm" weight="bold">
            Internal notes:{' '}
          </AppText>
          {incident.internalNotes}
        </AppText>
      ) : null}
    </Section>
  );
}
