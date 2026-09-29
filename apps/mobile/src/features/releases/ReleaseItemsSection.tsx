import { RELEASE_ITEM_KIND, type ReleaseDetail, type ReleaseItemRow } from '@ashniva/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { IconTile } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { AddReleaseItemSheet } from './AddReleaseItemSheet';
import { RELEASE_INVALIDATES } from './release-api';
import { ITEM_KIND_ICONS, ITEM_KIND_LABELS, isDraft } from './release-display';

export interface ItemLinks {
  onOpenTask?: (id: string) => void;
  onOpenTicket?: (id: string) => void;
  onOpenChangeRequest?: (id: string) => void;
}

/** Where an item's own screen lives, so a reader can check what is actually going out. */
function openerFor(item: ReleaseItemRow, links: ItemLinks): (() => void) | null {
  if (item.kind === RELEASE_ITEM_KIND.TASK && item.taskId && links.onOpenTask) {
    const { onOpenTask } = links;
    const id = item.taskId;
    return () => onOpenTask(id);
  }
  if (item.kind === RELEASE_ITEM_KIND.TICKET && item.ticketId && links.onOpenTicket) {
    const { onOpenTicket } = links;
    const id = item.ticketId;
    return () => onOpenTicket(id);
  }
  if (
    item.kind === RELEASE_ITEM_KIND.CHANGE_REQUEST &&
    item.changeRequestId &&
    links.onOpenChangeRequest
  ) {
    const { onOpenChangeRequest } = links;
    const id = item.changeRequestId;
    return () => onOpenChangeRequest(id);
  }
  return null;
}

/**
 * What is going out.
 *
 * Editable only while the release is a draft: once approval has been requested the sign-offs refer
 * to this list, so adding to it afterwards would ship something nobody approved.
 */
export function ReleaseItemsSection({
  release,
  canManage,
  links,
}: {
  release: ReleaseDetail;
  canManage: boolean;
  links: ItemLinks;
}) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const mayChange = canManage && isDraft(release.status);
  const remove = useApiMutation<string, ReleaseDetail>({
    path: (itemId) => `/releases/${release.id}/items/${itemId}`,
    method: 'DELETE',
    invalidate: RELEASE_INVALIDATES,
  });

  return (
    <Section
      title="Included work"
      count={release.items.length}
      icon="layers-outline"
      action={
        mayChange ? (
          <Button
            label="Add work"
            icon="add"
            size="sm"
            variant="ghost"
            onPress={() => setAdding(true)}
          />
        ) : undefined
      }
    >
      {release.items.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing in this release yet. Add the tasks, tickets and change requests that go out
          together.
        </AppText>
      ) : (
        release.items.map((item, index) => (
          <View key={item.id} style={{ gap: theme.spacing.sm }}>
            {index > 0 ? <Divider /> : null}
            <ItemRow
              item={item}
              onOpen={openerFor(item, links)}
              {...(mayChange
                ? { onRemove: () => void remove.run(item.id), removing: remove.busy }
                : {})}
            />
          </View>
        ))
      )}
      {mayChange ? null : (
        <AppText size="xs" tone="faint">
          Contents are fixed once approval is requested.
        </AppText>
      )}
      {remove.error ? (
        <Banner tone="danger" role="alert">
          {remove.error}
        </Banner>
      ) : null}
      {adding ? <AddReleaseItemSheet release={release} onClose={() => setAdding(false)} /> : null}
    </Section>
  );
}

function ItemRow({
  item,
  onOpen,
  onRemove,
  removing = false,
}: {
  item: ReleaseItemRow;
  onOpen: (() => void) | null;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const theme = useTheme();
  const body = (
    <>
      <IconTile name={ITEM_KIND_ICONS[item.kind]} tone="primary" size={32} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="xs" tone="muted" weight="medium">
          {ITEM_KIND_LABELS[item.kind]} · {item.reference}
        </AppText>
        <AppText size="sm" numberOfLines={2}>
          {item.title}
        </AppText>
      </View>
    </>
  );

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.reference} ${item.title}`}
          onPress={onOpen}
          style={({ pressed }) => ({
            alignItems: 'center',
            flex: 1,
            flexDirection: 'row',
            gap: theme.spacing.md,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {body}
        </Pressable>
      ) : (
        <View
          style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: theme.spacing.md }}
        >
          {body}
        </View>
      )}
      {onRemove ? (
        <Button
          label="Remove"
          size="sm"
          variant="dangerGhost"
          disabled={removing}
          accessibilityHint={`Takes ${item.reference} out of this release`}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}
