import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { lineProblem, type LineDraft } from './invoice-form';

type Editable = Exclude<keyof LineDraft, 'key'>;

/**
 * Adding or changing one invoice line — the web editor's row of fields, as a sheet, so the list
 * of lines stays readable as cards on a narrow screen.
 */
export function LineItemSheet({
  line,
  isNew,
  onSave,
  onRemove,
  onClose,
}: {
  line: LineDraft;
  isNew: boolean;
  onSave: (line: LineDraft) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(line);
  const [tried, setTried] = useState(false);
  const problem = lineProblem(draft);

  const field = (key: Editable) => ({
    value: draft[key],
    onChangeText: (value: string) => setDraft((current) => ({ ...current, [key]: value })),
  });

  const save = () => {
    setTried(true);
    if (!problem) {
      onSave(draft);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? 'Add a line' : 'Edit line'}
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          {isNew ? (
            <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          ) : (
            <Button
              label="Remove"
              icon="trash-outline"
              variant="dangerGhost"
              onPress={onRemove}
              style={{ flex: 1 }}
            />
          )}
          <Button
            label={isNew ? 'Add line' : 'Save line'}
            icon="checkmark"
            onPress={save}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Description" required>
        <Input
          accessibilityLabel="Description"
          placeholder="Managed support — September"
          maxLength={500}
          {...field('description')}
        />
      </Field>
      <Field label="HSN/SAC" hint="Optional">
        <Input
          accessibilityLabel="HSN/SAC"
          placeholder="998314"
          keyboardType="number-pad"
          maxLength={20}
          {...field('hsnSac')}
        />
      </Field>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Quantity" required>
            <Input
              accessibilityLabel="Quantity"
              keyboardType="decimal-pad"
              {...field('quantity')}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Unit">
            <Input accessibilityLabel="Unit" placeholder="Nos" maxLength={20} {...field('unit')} />
          </Field>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Unit price" required>
            <Input
              accessibilityLabel="Unit price"
              keyboardType="decimal-pad"
              {...field('unitPrice')}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="GST %" required>
            <Input accessibilityLabel="GST %" keyboardType="decimal-pad" {...field('taxRate')} />
          </Field>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Discount %">
            <Input
              accessibilityLabel="Discount %"
              keyboardType="decimal-pad"
              {...field('discountPercent')}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Discount amount">
            <Input
              accessibilityLabel="Discount amount"
              keyboardType="decimal-pad"
              {...field('discountAmount')}
            />
          </Field>
        </View>
      </View>
      {tried && problem ? (
        <Banner tone="danger" role="alert">
          {problem}
        </Banner>
      ) : null}
    </Sheet>
  );
}
