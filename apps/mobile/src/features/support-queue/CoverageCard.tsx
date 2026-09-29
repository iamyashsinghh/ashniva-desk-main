import type { EffectiveAvailability, SupportOwnershipSummary } from '@ashniva/types';

import { KeyValueRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';

/** The named roles, in the order the router will try them. */
const ROLES = [
  { label: 'Primary developer', of: 'primaryDeveloper' },
  { label: 'Backup developer', of: 'backupDeveloper' },
  { label: 'Senior / escalation', of: 'senior' },
  { label: 'Tester', of: 'tester' },
  { label: 'Support executive', of: 'supportExecutive' },
] as const;

/**
 * Who covers this project's support — read here, changed on the web.
 *
 * Ownership is configuration: module owners, acknowledgement and escalation clocks, whether the
 * project routes at all. Those are the administration screen's (`/admin/support-routing`), which
 * stays on the web. What a lead needs on a phone is to see who the chain will try, so the team
 * and on-call edits below make sense.
 */
export function CoverageCard({
  ownership,
  team,
}: {
  ownership: SupportOwnershipSummary;
  team: readonly EffectiveAvailability[];
}) {
  const nameOf = (userId: string) =>
    team.find((member) => member.userId === userId)?.user.name ?? 'Somebody no longer on the team';
  const modules = Object.entries(ownership.moduleOwners);

  return (
    <Section
      title="Support coverage"
      icon="shield-checkmark-outline"
      collapsible
      initiallyOpen={false}
    >
      <KeyValueRow
        label="Automatic routing"
        value={ownership.autoRouteEnabled ? 'On' : 'Off — every ticket waits here'}
        {...(ownership.autoRouteEnabled ? {} : { tone: 'danger' as const })}
      />
      {ROLES.map((role) => (
        <KeyValueRow
          key={role.of}
          label={role.label}
          value={ownership[role.of]?.name ?? 'Nobody'}
        />
      ))}
      <KeyValueRow label="When nobody fits" value={ownership.fallbackUser?.name ?? 'This queue'} />
      <Divider />
      <KeyValueRow label="Acknowledge within" value={`${ownership.ackMinutes} min`} />
      <KeyValueRow label="Escalate after" value={`${ownership.escalationMinutes} min`} />
      <KeyValueRow
        label="Workload limit"
        value={ownership.workloadLimit === null ? 'No limit' : String(ownership.workloadLimit)}
      />
      {modules.length > 0 ? (
        <>
          <Divider />
          <AppText variant="label" tone="muted" uppercase>
            Module owners
          </AppText>
          {modules.map(([area, userId]) => (
            <KeyValueRow key={area} label={area} value={nameOf(userId)} />
          ))}
        </>
      ) : null}
      <AppText size="xs" tone="faint">
        Changing who covers the project is done on the web, under Support routing.
      </AppText>
    </Section>
  );
}
