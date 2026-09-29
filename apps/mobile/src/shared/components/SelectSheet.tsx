import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, IconTile, type IconName, type IconTone } from './Icon';
import { AppText, Button, Input } from './primitives';
import { Sheet } from './Sheet';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
  iconTone?: IconTone;
}

/** Lists longer than this get a search box: scrolling past a dozen names to find one is slow. */
const SEARCH_THRESHOLD = 8;

/**
 * Pick one — or several — from a list, in a bottom sheet.
 *
 * Single choice closes on tap, because the tap *is* the decision. Multiple choice keeps the sheet
 * open and commits on "Done", so a half-made selection is never saved by accident.
 */
export function SelectSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
  multiple = false,
  loading = false,
  allowClear = false,
  clearLabel = 'None',
  emptyText = 'Nothing to choose from.',
}: {
  visible: boolean;
  title: string;
  options: readonly SelectOption<T>[];
  selected: readonly T[];
  onClose: () => void;
  /** Receives the whole selection: one value, none (cleared), or several. */
  onSelect: (values: T[]) => void;
  multiple?: boolean;
  loading?: boolean;
  /** Offers an explicit "none" row for an optional single choice. */
  allowClear?: boolean;
  clearLabel?: string;
  emptyText?: string;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<T[]>([...selected]);
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset the draft each time the sheet opens, so a cancelled edit does not linger.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft([...selected]);
      setSearch('');
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return options;
    }
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        (option.description?.toLowerCase().includes(term) ?? false),
    );
  }, [options, search]);

  const toggle = (value: T) => {
    if (!multiple) {
      onSelect([value]);
      onClose();
      return;
    }
    setDraft((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const chosen = multiple ? draft : selected;

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      scroll={false}
      {...(multiple
        ? {
            footer: (
              <>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button
                  label={draft.length ? `Done (${draft.length})` : 'Done'}
                  icon="checkmark"
                  onPress={() => {
                    onSelect(draft);
                    onClose();
                  }}
                  style={{ flex: 1 }}
                />
              </>
            ),
          }
        : {})}
    >
      {options.length > SEARCH_THRESHOLD ? (
        <View style={{ paddingBottom: theme.spacing.sm, paddingHorizontal: theme.spacing.screen }}>
          <Input
            icon="search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            autoCorrect={false}
            accessibilityLabel={`Search ${title}`}
          />
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator style={{ padding: theme.spacing.xl }} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: theme.spacing.md,
            paddingHorizontal: theme.spacing.screen,
          }}
          ListHeaderComponent={
            allowClear && !multiple ? (
              <OptionRow
                label={clearLabel}
                icon="remove-circle-outline"
                selected={selected.length === 0}
                onPress={() => {
                  onSelect([]);
                  onClose();
                }}
              />
            ) : null
          }
          ListEmptyComponent={
            <AppText tone="muted" align="center" style={{ padding: theme.spacing.xl }}>
              {emptyText}
            </AppText>
          }
          renderItem={({ item }) => (
            <OptionRow
              label={item.label}
              {...(item.description ? { description: item.description } : {})}
              {...(item.icon ? { icon: item.icon } : {})}
              {...(item.iconTone ? { iconTone: item.iconTone } : {})}
              selected={chosen.includes(item.value)}
              multiple={multiple}
              onPress={() => toggle(item.value)}
            />
          )}
        />
      )}
    </Sheet>
  );
}

function OptionRow({
  label,
  description,
  icon,
  iconTone = 'neutral',
  selected,
  multiple = false,
  onPress,
}: {
  label: string;
  description?: string;
  icon?: IconName;
  iconTone?: IconTone;
  selected: boolean;
  multiple?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const multipleMark = selected ? 'checkbox' : 'square-outline';
  const mark = multiple ? multipleMark : 'checkmark-circle';
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
        borderRadius: theme.radius.sm + 2,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET + 8,
        opacity: pressed ? 0.75 : 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      })}
    >
      {icon ? <IconTile name={icon} tone={iconTone} size={34} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight={selected ? 'medium' : 'regular'} numberOfLines={1}>
          {label}
        </AppText>
        {description ? (
          <AppText size="xs" tone="muted" numberOfLines={1}>
            {description}
          </AppText>
        ) : null}
      </View>
      {selected || multiple ? (
        <Icon
          name={mark}
          size={22}
          color={selected ? theme.colors.primary : theme.colors.textFaint}
        />
      ) : null}
    </Pressable>
  );
}
