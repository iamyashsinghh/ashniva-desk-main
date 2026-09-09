import { Card, FormField, Input } from '@ashniva/ui';

import type { BillingProfileForm } from '../form';

interface Props {
  form: BillingProfileForm;
  onChange: (next: BillingProfileForm) => void;
}

/**
 * Who the invoice is from.
 *
 * The state code is the field with consequences: it decides whether GST splits into CGST and SGST
 * or is charged as IGST, so it is validated as two digits and explained in the hint rather than
 * left as another box to fill in.
 */
export function BillingIdentityFields({ form, onChange }: Props) {
  const setForm = onChange;
  return (
    <>
      <Card title="Legal identity">
        <div className="form-grid">
          <FormField label="Legal business name" required>
            <Input
              value={form.legalName}
              onChange={(event) => setForm({ ...form, legalName: event.target.value })}
            />
          </FormField>
          <FormField label="GSTIN" hint="15 characters, e.g. 29AABCU9603R1ZM">
            <Input
              value={form.gstin}
              onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })}
            />
          </FormField>
          <FormField label="PAN">
            <Input
              value={form.pan}
              onChange={(event) => setForm({ ...form, pan: event.target.value.toUpperCase() })}
            />
          </FormField>
          <FormField label="Billing email" required>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>
          <FormField label="Phone">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </FormField>
        </div>
      </Card>

      <Card title="Address">
        <div className="form-grid">
          <FormField label="Address line 1" required>
            <Input
              value={form.addressLine1}
              onChange={(event) => setForm({ ...form, addressLine1: event.target.value })}
            />
          </FormField>
          <FormField label="Address line 2">
            <Input
              value={form.addressLine2}
              onChange={(event) => setForm({ ...form, addressLine2: event.target.value })}
            />
          </FormField>
          <FormField label="City" required>
            <Input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
            />
          </FormField>
          <FormField label="State" required>
            <Input
              value={form.state}
              onChange={(event) => setForm({ ...form, state: event.target.value })}
            />
          </FormField>
          <FormField
            label="State code"
            required
            hint="Two digits. Decides CGST+SGST versus IGST on every invoice."
          >
            <Input
              value={form.stateCode}
              inputMode="numeric"
              maxLength={2}
              onChange={(event) => setForm({ ...form, stateCode: event.target.value })}
            />
          </FormField>
          <FormField label="Postal code" required>
            <Input
              value={form.postalCode}
              onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
            />
          </FormField>
        </div>
      </Card>
    </>
  );
}
