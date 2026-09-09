import type { ClientBillingProfile, OrganizationOption } from '@ashniva/types';
import { Button, Card, FormField, Input, Select } from '@ashniva/ui';
import { useMemo, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useReauth } from '../../auth/reauth';
import { useOrganizationsQuery } from '../../users/api';
import { useBillingMutations, useClientBillingProfilesQuery } from '../api';
import {
  clientBillingFormFrom,
  clientBillingPayloadFrom,
  type ClientBillingForm,
} from '../client-form';

/**
 * Who the invoice is *to*.
 *
 * A GST tax invoice has to carry the recipient's registered name, address and GSTIN, and nothing
 * held them: the snapshot read the client's own billing profile, which a provider can never be
 * shown. These are the provider's notes about a client, so they are edited here rather than asked
 * of the client — a client cannot change how it is billed.
 */
export function ClientBillingCard() {
  const clients = useOrganizationsQuery();
  const recorded = useClientBillingProfilesQuery();
  const { saveClientProfile } = useBillingMutations();
  const reauth = useReauth();

  const [selected, setSelected] = useState('');
  const [form, setForm] = useState<ClientBillingForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const options = useMemo(
    () => choicesFor(clients.data, recorded.data),
    [clients.data, recorded.data],
  );

  const choose = (clientOrganizationId: string) => {
    setSelected(clientOrganizationId);
    setError(null);
    setNotice(null);
    setForm(
      clientOrganizationId
        ? clientBillingFormFrom(
            recorded.data?.find((row) => row.clientOrganizationId === clientOrganizationId) ?? null,
          )
        : null,
    );
  };

  const valid =
    form !== null && form.legalName.trim().length > 1 && /^\d{2}$/.test(form.stateCode.trim());

  const save = async () => {
    if (!form) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const token = await reauth.request();
      await saveClientProfile.mutateAsync({
        clientOrganizationId: selected,
        ...clientBillingPayloadFrom(form),
        headers: reauth.headers(token),
      });
      setNotice('Billing details for this client saved');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <Card title="Who invoices are billed to">
        <p className="muted">
          Printed in the “Bill to” block and frozen onto each invoice when it is issued, so a later
          correction never changes a document already sent. The place of supply still decides the
          tax on each invoice; nothing here does.
        </p>
        <div className="form-grid">
          <FormField label="Client" hint="Clients with details already recorded are marked">
            <Select
              value={selected}
              onChange={(event) => choose(event.target.value)}
              options={[{ value: '', label: 'Choose a client…' }, ...options]}
            />
          </FormField>
        </div>

        {form ? (
          <>
            <div className="form-grid">
              <FormField label="Registered name" required hint="As it should appear on the invoice">
                <Input
                  value={form.legalName}
                  onChange={(event) => setForm({ ...form, legalName: event.target.value })}
                />
              </FormField>
              <FormField label="GSTIN" hint="Leave empty for an unregistered client">
                <Input
                  value={form.gstin}
                  onChange={(event) =>
                    setForm({ ...form, gstin: event.target.value.toUpperCase() })
                  }
                />
              </FormField>
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
                label="Client state code"
                required
                hint="Two digits. Printed only — the invoice’s place of supply sets the tax."
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
            <div className="detail-actions">
              <Button
                variant="primary"
                loading={saveClientProfile.isPending}
                disabled={!valid}
                disabledReason="A registered name and a two-digit state code are required"
                onClick={() => void save()}
              >
                Save client billing details
              </Button>
            </div>
            <p className="muted">
              These details go on a tax document, so you will be asked for your password.
            </p>
          </>
        ) : null}
        {notice ? <p className="messaging-notice">{notice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </Card>
      {reauth.modal}
    </>
  );
}

/** Every client organization, with the ones already recorded marked so the gaps are visible. */
function choicesFor(
  // `useOrganizationsQuery` returns the narrow option shape, not the summary: the summary carries a
  // client's user, project and open-ticket counts, and a picker has no business being handed
  // another company's commercial numbers. Only id, name and isServiceProvider are read here.
  organizations: OrganizationOption[] | undefined,
  recorded: ClientBillingProfile[] | undefined,
): { value: string; label: string }[] {
  const known = new Set((recorded ?? []).map((row) => row.clientOrganizationId));
  return (organizations ?? [])
    .filter((organization) => !organization.isServiceProvider)
    .map((organization) => ({
      value: organization.id,
      label: known.has(organization.id) ? `${organization.name} · recorded` : organization.name,
    }));
}
