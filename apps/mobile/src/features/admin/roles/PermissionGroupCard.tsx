import type { PermissionKey } from '@ashniva/types';
import { Fragment } from 'react';

import { Section } from '../../../shared/components/layout';
import { AppText, Divider } from '../../../shared/components/primitives';
import { SwitchRow } from '../shared/SwitchRow';
import type { PermissionGroup } from './role-permissions';

/**
 * One area of the matrix — Tasks, Tickets, Reports — folded to its heading and a count of what is
 * on, so the whole catalogue fits a few screens and the area being changed opens with one tap.
 *
 * Each permission reads as the sentence the catalogue gives it, with the key underneath: the key
 * is what the API and the audit history call it, and what somebody comparing the two will look for.
 */
export function PermissionGroupCard({
  group,
  granted,
  editable,
  initiallyOpen,
  onToggle,
}: {
  group: PermissionGroup;
  granted: ReadonlySet<PermissionKey>;
  editable: boolean;
  initiallyOpen: boolean;
  onToggle: (key: PermissionKey, on: boolean) => void;
}) {
  const on = group.entries.filter((entry) => granted.has(entry.key)).length;
  return (
    <Section
      title={group.module}
      collapsible
      initiallyOpen={initiallyOpen}
      action={
        <AppText size="xs" tone={on > 0 ? 'primary' : 'faint'} weight="medium" tabular>
          {`${on}/${group.entries.length}`}
        </AppText>
      }
    >
      {group.entries.map((entry, index) => (
        <Fragment key={entry.key}>
          {index > 0 ? <Divider /> : null}
          <SwitchRow
            label={entry.description}
            detail={entry.key}
            value={granted.has(entry.key)}
            disabled={!editable}
            onChange={(value) => onToggle(entry.key, value)}
          />
        </Fragment>
      ))}
    </Section>
  );
}
