import type { EffectiveAvailability, SupportOwnershipSummary } from '@ashniva/types';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { OWNERSHIP_ROLES } from './ownership-form';

/** Who covers this project's support, in the order the router tries them, with an Edit action. */
export function OwnershipSummary({
  ownership,
  team,
  onEdit,
}: {
  ownership: SupportOwnershipSummary;
  team: readonly EffectiveAvailability[];
  onEdit: () => void;
}) {
  const nameOf = (userId: string) =>
    team.find((member) => member.userId === userId)?.user.name ?? 'Somebody no longer on the team';
  const modules = Object.entries(ownership.moduleOwners);

  return (
    <Section
      title="Support ownership"
      icon="shield-checkmark-outline"
      action={
        <Button label="Edit" icon="create-outline" size="sm" variant="ghost" onPress={onEdit} />
      }
    >
      <Pill
        label={ownership.autoRouteEnabled ? 'Routing automatically' : 'Manual assignment only'}
        tone={ownership.autoRouteEnabled ? 'success' : 'warning'}
      />
      <AppText size="xs" tone="muted">
        Tried in this order when a ticket arrives.
      </AppText>
      {OWNERSHIP_ROLES.map((role) => (
        <KeyValueRow
          key={role.key}
          label={role.label}
          value={ownership[role.of]?.name ?? 'Nobody'}
        />
      ))}
      <KeyValueRow label="When nobody fits" value={ownership.fallbackUser?.name ?? 'The queue'} />
      <Divider />
      <AppText variant="label" tone="muted" uppercase>
        Module owners
      </AppText>
      {modules.length === 0 ? (
        <AppText size="sm" tone="muted">
          None yet. A ticket naming an owned work area goes to its owner before anybody else.
        </AppText>
      ) : (
        modules.map(([area, userId]) => (
          <KeyValueRow key={area} label={area} value={nameOf(userId)} />
        ))
      )}
      <Divider />
      <KeyValueRow label="Acknowledge within" value={`${ownership.ackMinutes} min`} />
      <KeyValueRow label="Escalate after" value={`${ownership.escalationMinutes} min`} />
      <KeyValueRow
        label="Workload limit"
        value={ownership.workloadLimit === null ? 'No limit' : String(ownership.workloadLimit)}
      />
      <AppText size="xs" tone="faint">
        Last changed {formatDateTime(ownership.updatedAt) ?? '—'}
      </AppText>
    </Section>
  );
}
