import { ORGANIZATION_TYPE, type OrganizationSummary, type OrganizationType } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { ChipGroup } from '../../../shared/components/chips';
import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { ORGANIZATION_TYPES, organizationTypeLabel } from './company-display';

interface CompanyForm {
  name: string;
  type: OrganizationType;
  timezone: string;
  currency: string;
}

/**
 * Create or edit a company — the web's organization dialog: name, kind, timezone and currency.
 *
 * The slug is left to the API, which derives it from the name, as the web does. The currency is
 * upper-cased as it is typed because the API stores the ISO code and a lower-case one would look
 * like a different currency on every invoice.
 */
export function CompanyFormSheet({
  organization,
  onClose,
  onSaved,
}: {
  organization?: OrganizationSummary;
  onClose: () => void;
  onSaved: (organization: OrganizationSummary) => void;
}) {
  const [form, setForm] = useState<CompanyForm>({
    name: organization?.name ?? '',
    type: organization?.type ?? ORGANIZATION_TYPE.CORPORATE_CUSTOMER,
    timezone: organization?.timezone ?? 'Asia/Kolkata',
    currency: organization?.currency ?? 'INR',
  });
  const save = useApiMutation<CompanyForm, OrganizationSummary>({
    path: organization ? `/organizations/${organization.id}` : '/organizations',
    method: organization ? 'PATCH' : 'POST',
    body: (values) => ({
      name: values.name.trim(),
      type: values.type,
      ...(values.timezone.trim() ? { timezone: values.timezone.trim() } : {}),
      ...(values.currency.trim().length === 3 ? { currency: values.currency.trim() } : {}),
    }),
    invalidate: [['organizations']],
    onSuccess: (saved) => onSaved(saved),
  });
  const patch = (change: Partial<CompanyForm>) => {
    save.reset();
    setForm((current) => ({ ...current, ...change }));
  };
  const currencyInvalid = form.currency.length > 0 && form.currency.length !== 3;
  const valid = form.name.trim().length >= 2 && !currencyInvalid;

  return (
    <Sheet
      visible
      title={organization ? 'Edit company' : 'New company'}
      {...(organization ? { subtitle: organization.name } : {})}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={organization ? 'Save' : 'Create'}
            icon="checkmark"
            loading={save.busy}
            disabled={!valid}
            onPress={() => void save.run(form)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Name" required hint="At least two characters.">
        <Input
          accessibilityLabel="Company name"
          value={form.name}
          onChangeText={(name) => patch({ name })}
          autoCapitalize="words"
        />
      </Field>
      <ChipGroup
        label="Type"
        options={ORGANIZATION_TYPES}
        selected={form.type}
        onSelect={(type) => patch({ type })}
        labelFor={organizationTypeLabel}
      />
      <Field label="Timezone" hint="An IANA name, such as Asia/Kolkata.">
        <Input
          accessibilityLabel="Timezone"
          value={form.timezone}
          onChangeText={(timezone) => patch({ timezone })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Field
        label="Currency"
        hint="Three-letter code, such as INR."
        {...(currencyInvalid ? { error: 'Use the three-letter code.' } : {})}
      >
        <Input
          accessibilityLabel="Currency"
          value={form.currency}
          maxLength={3}
          autoCapitalize="characters"
          autoCorrect={false}
          invalid={currencyInvalid}
          onChangeText={(currency) => patch({ currency: currency.toUpperCase() })}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
