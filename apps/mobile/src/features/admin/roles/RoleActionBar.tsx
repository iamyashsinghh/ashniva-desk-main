import type { CustomRoleDetail, PermissionKey } from '@ashniva/types';
import { useState } from 'react';

import { Grow, StickyActionBar } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { changeCountLabel } from './role-permissions';
import { DeleteRoleSheet, RoleDetailsSheet, SaveRoleSheet } from './RoleSheets';

/**
 * The bottom of a custom role: Save and Discard while the matrix has unsaved changes, otherwise
 * the role's own actions — its name, and deleting it once nobody holds it.
 */
export function RoleActionBar({
  role,
  draft,
  added,
  removed,
  onDiscard,
  onDeleted,
}: {
  role: CustomRoleDetail;
  draft: ReadonlySet<PermissionKey>;
  added: number;
  removed: number;
  onDiscard: () => void;
  onDeleted: () => void;
}) {
  const [sheet, setSheet] = useState<'save' | 'details' | 'delete' | null>(null);
  const changed = added + removed;
  const close = () => setSheet(null);

  let bar;
  if (changed > 0) {
    bar = (
      <StickyActionBar
        note={
          <AppText size="sm" weight="medium" tone="primary" tabular>
            {changeCountLabel(changed)}
          </AppText>
        }
      >
        <Grow>
          <Button label="Discard" icon="close" variant="secondary" onPress={onDiscard} />
        </Grow>
        <Grow>
          <Button label="Save" icon="checkmark" onPress={() => setSheet('save')} />
        </Grow>
      </StickyActionBar>
    );
  } else {
    const inUse = role.memberCount > 0;
    bar = (
      <StickyActionBar
        note={
          inUse ? (
            <AppText size="xs" tone="muted">
              {`Move the ${role.memberCount === 1 ? 'person' : `${role.memberCount} people`} on this role to another before deleting it.`}
            </AppText>
          ) : undefined
        }
      >
        <Grow>
          <Button
            label="Edit details"
            icon="create-outline"
            variant="secondary"
            onPress={() => setSheet('details')}
          />
        </Grow>
        <Grow>
          <Button
            label="Delete"
            icon="trash-outline"
            variant="dangerGhost"
            disabled={inUse}
            onPress={() => setSheet('delete')}
          />
        </Grow>
      </StickyActionBar>
    );
  }

  return (
    <>
      {bar}
      {sheet === 'save' ? (
        <SaveRoleSheet
          role={role}
          permissions={[...draft]}
          added={added}
          removed={removed}
          onClose={close}
          onSaved={close}
        />
      ) : null}
      {sheet === 'details' ? <RoleDetailsSheet role={role} onClose={close} /> : null}
      {sheet === 'delete' ? (
        <DeleteRoleSheet role={role} onClose={close} onDeleted={onDeleted} />
      ) : null}
    </>
  );
}
