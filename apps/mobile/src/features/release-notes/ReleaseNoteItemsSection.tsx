import {
  RELEASE_NOTE_ITEM_KIND_LABELS,
  type ReleaseNoteDetail,
  type ReleaseNoteItemSummary,
} from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Icon, IconTile } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { DISABLED_OPACITY, TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useReleaseNoteWrite } from './release-note-api';
import { ITEM_KIND_ICONS, lineLabel } from './release-note-display';

/**
 * The lines on the note, in the order the client will read them.
 *
 * A line the client cannot see is still listed, marked "Internal only" — an editor needs to know
 * it is there; the published copy drops it. Reordering sends the whole order, as the API wants.
 */
export function ReleaseNoteItemsSection({
  note,
  editable,
}: {
  note: ReleaseNoteDetail;
  editable: boolean;
}) {
  const theme = useTheme();
  const remove = useReleaseNoteWrite<string>(note.id, (itemId) => `items/${itemId}`, {
    method: 'DELETE',
  });
  const reorder = useReleaseNoteWrite<string[]>(note.id, 'items/order', {
    method: 'PATCH',
    body: (itemIds) => ({ itemIds }),
  });
  const busy = remove.busy || reorder.busy;

  const move = (index: number, direction: -1 | 1) => {
    const moved = note.items[index];
    const displaced = note.items[index + direction];
    if (!moved || !displaced) {
      return;
    }
    const next = note.items.map((item, position) => {
      if (position === index) {
        return displaced;
      }
      return position === index + direction ? moved : item;
    });
    void reorder.run(next.map((item) => item.id));
  };

  return (
    <Section title="What is in this release" icon="list-outline" count={note.items.length}>
      {note.items.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing yet. Generate from completed work, or add a line by hand.
        </AppText>
      ) : (
        note.items.map((item, index) => (
          <View key={item.id} style={{ gap: theme.spacing.sm }}>
            {index > 0 ? <Divider /> : null}
            <LineRow
              item={item}
              {...(editable
                ? {
                    controls: {
                      busy,
                      first: index === 0,
                      last: index === note.items.length - 1,
                      onUp: () => move(index, -1),
                      onDown: () => move(index, 1),
                      onRemove: () => void remove.run(item.id),
                    },
                  }
                : {})}
            />
          </View>
        ))
      )}
      {remove.error || reorder.error ? (
        <Banner tone="danger" role="alert">
          {remove.error ?? reorder.error}
        </Banner>
      ) : null}
    </Section>
  );
}

interface LineControls {
  busy: boolean;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}

function LineRow({ item, controls }: { item: ReleaseNoteItemSummary; controls?: LineControls }) {
  const theme = useTheme();
  const label = lineLabel(item);
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile
          name={ITEM_KIND_ICONS[item.kind]}
          tone={item.clientVisible ? 'teal' : 'warning'}
          size={32}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText size="sm">{label}</AppText>
          <PillRow>
            <Pill label={RELEASE_NOTE_ITEM_KIND_LABELS[item.kind]} />
            {item.source === 'MANUAL' ? <Pill label="Added by hand" tone="info" /> : null}
            {item.clientVisible ? null : <Pill label="Internal only" tone="warning" />}
          </PillRow>
        </View>
      </View>
      {controls ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
          <IconButton
            icon="arrow-up"
            label={`Move “${label}” up`}
            disabled={controls.busy || controls.first}
            onPress={controls.onUp}
          />
          <IconButton
            icon="arrow-down"
            label={`Move “${label}” down`}
            disabled={controls.busy || controls.last}
            onPress={controls.onDown}
          />
          <IconButton
            icon="trash-outline"
            label={`Remove “${label}”`}
            danger
            disabled={controls.busy}
            onPress={controls.onRemove}
          />
        </View>
      ) : null}
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  danger = false,
}: {
  icon: 'arrow-up' | 'arrow-down' | 'trash-outline';
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.colors.danger : theme.colors.textMuted;
  const pressedOpacity = (pressed: boolean) => (pressed ? 0.7 : 1);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm + 2,
        height: TOUCH_TARGET,
        justifyContent: 'center',
        opacity: disabled ? DISABLED_OPACITY : pressedOpacity(pressed),
        width: TOUCH_TARGET,
      })}
    >
      <Icon name={icon} size={18} color={color} />
    </Pressable>
  );
}
