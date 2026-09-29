import { View } from 'react-native';

import { AppText, Button, Divider, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import type { ModuleRow } from './ownership-form';

/**
 * Work areas and their owners, one row each.
 *
 * A row left without an area or an owner is dropped on save rather than refused, as on the web —
 * adding a row and changing your mind should not block the rest of the form.
 */
export function ModuleOwnersFields({
  rows,
  people,
  onChange,
}: {
  rows: readonly ModuleRow[];
  people: readonly SelectOption[];
  onChange: (rows: ModuleRow[]) => void;
}) {
  const theme = useTheme();
  const setRow = (index: number, patch: Partial<ModuleRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText size="sm" weight="medium">
        Module owners
      </AppText>
      <AppText size="xs" tone="muted">
        A ticket naming one of these work areas goes to its owner before anybody else is considered.
      </AppText>
      {rows.map((row, index) => (
        <View key={index} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <Field label={`Work area ${index + 1}`}>
            <Input
              accessibilityLabel={`Work area ${index + 1}`}
              value={row.area}
              onChangeText={(area) => setRow(index, { area })}
              placeholder="Billing"
            />
          </Field>
          <SelectField
            label={`Owner of work area ${index + 1}`}
            icon="person-outline"
            options={people}
            value={row.userId ? [row.userId] : []}
            onChange={(ids) => setRow(index, { userId: ids[0] ?? null })}
            placeholder="Nobody"
          />
          <Button
            label="Remove"
            icon="trash-outline"
            size="sm"
            variant="dangerGhost"
            accessibilityHint={`Removes work area ${index + 1}`}
            onPress={() => onChange(rows.filter((_, at) => at !== index))}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ))}
      <Button
        label="Add work area"
        icon="add"
        size="sm"
        variant="secondary"
        onPress={() => onChange([...rows, { area: '', userId: null }])}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}
