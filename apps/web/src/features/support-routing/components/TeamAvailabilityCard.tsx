import { AVAILABILITY_STATUS_LABELS, type EffectiveAvailability } from '@ashniva/types';
import { AVAILABILITY_STATUS_TONES, Badge, Button, Card, FormActions, Table } from '@ashniva/ui';
export interface TeamAvailabilityCardProps {
  team: EffectiveAvailability[];
  onEditSchedule: (member: EffectiveAvailability) => void;
  onEditAvailability: (member: EffectiveAvailability) => void;
}

function hours(member: EffectiveAvailability): string {
  if (!member.schedule) {
    return 'No working hours configured';
  }
  const { schedule } = member;
  return `${schedule.startTime}–${schedule.endTime} ${schedule.timezone}`;
}

/**
 * The team as the routing engine sees them.
 *
 * Two status columns rather than one, on purpose. "Recorded" is the last thing anybody said —
 * usually Ashniva HR. "Effective" is what routing will act on, which folds in the rota and today's
 * on-call cover. When they disagree, that disagreement is the interesting fact: a manager looking
 * at somebody marked available who is nonetheless being skipped needs to see why here rather than
 * guess.
 */
export function TeamAvailabilityCard({
  team,
  onEditSchedule,
  onEditAvailability,
}: TeamAvailabilityCardProps) {
  return (
    <Card
      title="Team availability"
      headerAddon={<span className="muted">{team.length} project members</span>}
    >
      <Table<EffectiveAvailability>
        aria-label="Team working hours and availability"
        rowKey={(row) => row.userId}
        rows={team}
        empty={<p className="muted">This project has no members yet.</p>}
        columns={[
          {
            key: 'person',
            header: 'Person',
            render: (row) => (
              <span className="support-person">
                <strong>{row.user.name}</strong>
                <span className="support-person__hours">{hours(row)}</span>
              </span>
            ),
          },
          {
            key: 'recorded',
            header: 'Recorded',
            hideOnMobile: true,
            render: (row) => (
              <span className="support-person">
                <span>{AVAILABILITY_STATUS_LABELS[row.status]}</span>
                <span className="support-person__hours">
                  {row.source === 'SCHEDULE'
                    ? 'Nothing recorded — from the rota'
                    : `${row.source} · ${new Date(row.updatedAt).toLocaleDateString()}`}
                </span>
              </span>
            ),
          },
          {
            key: 'effective',
            header: 'Routing sees',
            render: (row) => (
              <Badge tone={AVAILABILITY_STATUS_TONES[row.effectiveStatus]}>
                {AVAILABILITY_STATUS_LABELS[row.effectiveStatus]}
              </Badge>
            ),
          },
          {
            key: 'within',
            header: 'In hours',
            hideOnMobile: true,
            render: (row) => (row.withinSchedule ? 'Yes' : 'No'),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <FormActions>
                <Button size="sm" onClick={() => onEditSchedule(row)}>
                  Hours
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEditAvailability(row)}>
                  Availability
                </Button>
              </FormActions>
            ),
          },
        ]}
      />
    </Card>
  );
}
