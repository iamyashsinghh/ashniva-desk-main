import { TAX_TREATMENT_LABELS, type TaxTreatment } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../shared/components/layout';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ToggleRow } from '../tasks/ToggleRow';
import type { InvoiceForm } from './invoice-form';

const TREATMENTS = (Object.keys(TAX_TREATMENT_LABELS) as TaxTreatment[]).map((value) => ({
  value,
  label: value === 'EXCLUSIVE' ? 'Plus GST' : 'GST included',
}));

/**
 * Where the supply is made and how GST applies — the field that decides whether tax splits into
 * CGST and SGST or is charged as IGST, against the provider's own state code.
 */
export function InvoiceSupplyFields({
  form,
  onPatch,
  ownStateCode,
}: {
  form: InvoiceForm;
  onPatch: (patch: Partial<InvoiceForm>) => void;
  ownStateCode: string | null;
}) {
  const theme = useTheme();
  const code = form.placeOfSupplyCode;
  const codeInvalid = code.length > 0 && !/^\d{2}$/.test(code);

  return (
    <Section title="Place of supply" icon="location-outline">
      <AppText size="sm" tone="muted">
        Decides whether GST splits into CGST and SGST or is charged as IGST. Your own state code is{' '}
        {ownStateCode ?? '—'}.
      </AppText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 2 }}>
          <Field label="State" required>
            <Input
              accessibilityLabel="State"
              placeholder="Maharashtra"
              maxLength={100}
              value={form.placeOfSupplyState}
              onChangeText={(value) => onPatch({ placeOfSupplyState: value })}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Code" required error={codeInvalid ? 'Two digits' : null}>
            <Input
              accessibilityLabel="State code"
              placeholder="27"
              keyboardType="number-pad"
              maxLength={2}
              invalid={codeInvalid}
              value={code}
              onChangeText={(value) => onPatch({ placeOfSupplyCode: value.trim() })}
            />
          </Field>
        </View>
      </View>
      <Segmented
        label="Pricing"
        options={TREATMENTS}
        value={form.taxTreatment}
        onChange={(value) => onPatch({ taxTreatment: value })}
      />
      <AppText size="xs" tone="faint">
        {TAX_TREATMENT_LABELS[form.taxTreatment]}
      </AppText>
      <ToggleRow
        label="Reverse charge"
        description="The client pays the GST directly; it is shown but not collected."
        icon="swap-horizontal-outline"
        value={form.reverseCharge}
        onChange={(value) => onPatch({ reverseCharge: value })}
      />
    </Section>
  );
}
