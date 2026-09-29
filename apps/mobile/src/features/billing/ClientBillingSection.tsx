import type { ClientBillingProfile } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { Banner, SuccessNote } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { useClientOptions } from '../projects/project-form-options';
import { billingKeys } from './billing-api';
import {
  clientBillingFormFrom,
  clientBillingPayloadFrom,
  clientBillingProblem,
  type ClientBillingForm,
} from './billing-form';
import { useGuardedWrite } from './guarded-write';
import { PasswordConfirmSheet } from './PasswordConfirmSheet';
import { TextField } from './TextField';

/**
 * Who invoices are billed *to* — the web's client billing card.
 *
 * These are the provider's notes about a client, printed in the "Bill to" block and frozen onto
 * each invoice when it is issued, so a later correction never changes a document already sent.
 * Clients with details already recorded are marked in the picker, so the gaps are visible.
 */
export function ClientBillingSection({
  recorded,
  canManage,
}: {
  recorded: readonly ClientBillingProfile[];
  canManage: boolean;
}) {
  const clients = useClientOptions();
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState<ClientBillingForm | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const write = useGuardedWrite<ClientBillingForm, ClientBillingProfile>({
    path: `/settings/billing/clients/${clientId}`,
    method: 'PUT',
    body: clientBillingPayloadFrom,
    invalidate: [billingKeys.clientProfiles],
    onSuccess: () => {
      setConfirming(false);
      setSaved(true);
    },
  });

  const options = useMemo(() => {
    const known = new Set(recorded.map((row) => row.clientOrganizationId));
    return clients.options.map((option) => ({
      ...option,
      description: known.has(option.value) ? 'Recorded' : 'Not recorded yet',
    }));
  }, [clients.options, recorded]);

  const choose = (id: string) => {
    setClientId(id);
    setSaved(false);
    write.reset();
    setForm(
      id
        ? clientBillingFormFrom(recorded.find((row) => row.clientOrganizationId === id) ?? null)
        : null,
    );
  };

  const bind = (key: keyof ClientBillingForm, transform?: (value: string) => string) => ({
    value: form?.[key] ?? '',
    editable: canManage,
    onChange: (value: string) => {
      setSaved(false);
      setForm((current) =>
        current ? { ...current, [key]: transform ? transform(value) : value } : current,
      );
    },
  });

  const problem = form ? clientBillingProblem(form) : null;

  return (
    <Section title="Who invoices are billed to" icon="people-outline">
      <AppText size="sm" tone="muted">
        Printed in the “Bill to” block and frozen onto each invoice when it is issued. The place of
        supply still decides the tax on each invoice; nothing here does.
      </AppText>
      <SelectField
        label="Client"
        icon="business-outline"
        options={options}
        loading={clients.isLoading}
        value={clientId ? [clientId] : []}
        onChange={(values) => choose(values[0] ?? '')}
        placeholder="Choose a client"
        hint="Each client shows whether its details are recorded"
      />
      {form ? (
        <>
          <TextField
            label="Registered name"
            required
            hint="As it should appear on the invoice"
            {...bind('legalName')}
          />
          <TextField
            label="Client GSTIN"
            hint="Leave empty for an unregistered client"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            {...bind('gstin', (value) => value.toUpperCase())}
          />
          {/* Labelled apart from the provider's own address above, for a screen reader. */}
          <TextField label="Client address line 1" required {...bind('addressLine1')} />
          <TextField label="Client address line 2" {...bind('addressLine2')} />
          <TextField label="Client city" required {...bind('city')} />
          <TextField label="Client state" required {...bind('state')} />
          <TextField
            label="Client state code"
            required
            hint="Two digits. Printed only — the invoice’s place of supply sets the tax."
            keyboardType="number-pad"
            maxLength={2}
            {...bind('stateCode')}
          />
          <TextField
            label="Client postal code"
            required
            keyboardType="number-pad"
            {...bind('postalCode')}
          />
          <TextField label="Client country" {...bind('country')} />
          {canManage ? (
            <>
              {problem ? (
                <AppText size="xs" tone="muted">
                  {problem}
                </AppText>
              ) : null}
              <Button
                label="Save client billing details"
                icon="save-outline"
                disabled={problem !== null}
                onPress={() => {
                  write.reset();
                  setConfirming(true);
                }}
              />
            </>
          ) : null}
          {saved ? <SuccessNote label="Billing details for this client saved" /> : null}
        </>
      ) : null}
      {!canManage && form ? (
        <Banner tone="neutral">Changing these needs the billing profile permission.</Banner>
      ) : null}
      {confirming && form ? (
        <PasswordConfirmSheet
          title="Save client billing details"
          message="These details go on a tax document, so the server asks for your password again."
          confirmLabel="Save"
          busy={write.busy}
          error={write.error}
          onEdit={write.reset}
          onClose={() => setConfirming(false)}
          onConfirm={(password) => void write.run(form, password)}
        />
      ) : null}
    </Section>
  );
}
