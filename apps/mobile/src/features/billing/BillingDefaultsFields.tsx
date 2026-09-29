import { TAX_TREATMENT_LABELS, type BillingProfile, type TaxTreatment } from '@ashniva/types';

import { Section } from '../../shared/components/layout';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Field } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { ToggleRow } from '../tasks/ToggleRow';
import {
  MONTHS,
  nextNumberLabel,
  type BillingProfileForm,
  type BindProfileField,
} from './billing-form';
import { TextField } from './TextField';

const MONTH_OPTIONS = MONTHS.map((label, index) => ({ value: String(index + 1), label }));
const TREATMENTS = (Object.keys(TAX_TREATMENT_LABELS) as TaxTreatment[]).map((value) => ({
  value,
  label: TAX_TREATMENT_LABELS[value],
}));

/**
 * How invoices are numbered and priced by default, and the text printed on every one.
 *
 * The next number is shown and not editable: the sequence advances when an invoice is issued, and
 * letting it be typed over is how two invoices end up with one number.
 */
export function BillingDefaultsFields({
  form,
  bind,
  onPatch,
  profile,
  readOnly,
}: {
  form: BillingProfileForm;
  bind: BindProfileField;
  onPatch: (patch: Partial<BillingProfileForm>) => void;
  profile: BillingProfile | null;
  readOnly: boolean;
}) {
  return (
    <>
      <Section title="Invoice defaults" icon="options-outline">
        <TextField
          label="Invoice prefix"
          hint="Gives INV/2026-27/0001"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          {...bind('invoicePrefix', (value) => value.toUpperCase())}
        />
        <TextField
          label="Payment terms (days)"
          keyboardType="number-pad"
          maxLength={3}
          {...bind('paymentTermsDays')}
        />
        <TextField
          label="Default GST rate"
          keyboardType="decimal-pad"
          {...bind('defaultTaxRate')}
        />
        <SelectField
          label="Financial year starts in"
          hint="Decides the year label on every invoice number — April gives 2026-27."
          icon="calendar-outline"
          options={MONTH_OPTIONS}
          disabled={readOnly}
          value={[form.financialYearStartMonth]}
          onChange={(values) => {
            if (values[0]) {
              onPatch({ financialYearStartMonth: values[0] });
            }
          }}
        />
        <Field label="Default pricing">
          <Segmented
            label="Default pricing"
            options={TREATMENTS}
            value={form.defaultTaxTreatment}
            onChange={(value) => {
              if (!readOnly) {
                onPatch({ defaultTaxTreatment: value });
              }
            }}
          />
        </Field>
        <ToggleRow
          label="Round totals to the rupee"
          description="Shows the difference as its own line, as Indian invoices normally do."
          icon="calculator-outline"
          disabled={readOnly}
          value={form.roundTotals}
          onChange={(roundTotals) => onPatch({ roundTotals })}
        />
        {profile ? (
          <AppText size="sm" tone="muted">
            Next invoice number: {nextNumberLabel(profile)}. The sequence is advanced when an
            invoice is issued and cannot be edited here.
          </AppText>
        ) : null}
      </Section>

      <Section title="Printed on every invoice" icon="print-outline">
        <TextField
          label="Bank and payment details"
          placeholder="HDFC Bank · A/C 50200012345678 · IFSC HDFC0001234 · UPI ashniva@hdfc"
          multiline
          style={{ minHeight: 88 }}
          {...bind('bankDetails')}
        />
        <TextField label="Terms" multiline style={{ minHeight: 88 }} {...bind('terms')} />
        <TextField
          label="Internal notes"
          hint="Never printed or sent to a client"
          multiline
          style={{ minHeight: 64 }}
          {...bind('internalNotes')}
        />
      </Section>
    </>
  );
}
