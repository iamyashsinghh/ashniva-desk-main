import { RELEASE_ITEM_KIND, type ReleaseDetail, type ReleaseItemKind } from '@ashniva/types';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Icon } from '../../shared/components/Icon';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { itemBody, useItemChoices, type ItemChoice } from './add-item-choices';
import { useReleaseAction } from './release-api';
import { ITEM_KIND_LABELS } from './release-display';
import { SheetButtons } from './SheetButtons';

const KIND_OPTIONS: readonly SegmentOption<ReleaseItemKind>[] = [
  { value: RELEASE_ITEM_KIND.TASK, label: 'Task' },
  { value: RELEASE_ITEM_KIND.TICKET, label: 'Ticket' },
  { value: RELEASE_ITEM_KIND.CHANGE_REQUEST, label: 'Change' },
];

/**
 * Add one task, ticket or change request to a draft release.
 *
 * The choices are listed inline rather than behind another picker: a sheet opened over a sheet is
 * not reliably shown on iOS, and the list is short enough to search in place.
 */
export function AddReleaseItemSheet({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<ReleaseItemKind>(RELEASE_ITEM_KIND.TASK);
  const [chosen, setChosen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { loading, error, choices } = useItemChoices(kind, release);
  const add = useReleaseAction<string>(release.id, 'items', (id) => itemBody(kind, id), onClose);

  const term = search.trim().toLowerCase();
  const shown = term
    ? choices.filter((choice) => `${choice.reference} ${choice.title}`.toLowerCase().includes(term))
    : choices;

  return (
    <Sheet
      visible
      title="Add work to this release"
      subtitle={release.projectName}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetButtons
          confirmLabel="Add"
          confirmIcon="add"
          busy={add.busy}
          disabled={!chosen}
          onCancel={onClose}
          onConfirm={() => {
            if (chosen) {
              void add.run(chosen);
            }
          }}
        />
      }
    >
      <Segmented
        label="Kind of work"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setChosen(null);
        }}
      />
      <Input
        icon="search"
        accessibilityLabel={`Search ${ITEM_KIND_LABELS[kind].toLowerCase()}s`}
        placeholder={`Search ${ITEM_KIND_LABELS[kind].toLowerCase()}s on this project`}
        autoCorrect={false}
        value={search}
        onChangeText={setSearch}
      />
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {!loading && !error && shown.length === 0 ? (
        <AppText size="sm" tone="muted">
          {choices.length === 0
            ? `No ${ITEM_KIND_LABELS[kind].toLowerCase()} on this project is left to add.`
            : 'Nothing matches the search.'}
        </AppText>
      ) : null}
      <View style={{ gap: theme.spacing.xs }}>
        {shown.map((choice) => (
          <ChoiceRow
            key={choice.id}
            choice={choice}
            selected={choice.id === chosen}
            onPress={() => setChosen(choice.id)}
          />
        ))}
      </View>
      {add.error ? (
        <Banner tone="danger" role="alert">
          {add.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}

function ChoiceRow({
  choice,
  selected,
  onPress,
}: {
  choice: ItemChoice;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={`${choice.reference} ${choice.title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        borderRadius: theme.radius.sm + 2,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET + 4,
        opacity: pressed ? 0.8 : 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      })}
    >
      <Icon
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? theme.colors.primary : theme.colors.textFaint}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="xs" tone="muted" weight="medium">
          {choice.reference}
        </AppText>
        <AppText size="sm" numberOfLines={2}>
          {choice.title}
        </AppText>
      </View>
    </Pressable>
  );
}
