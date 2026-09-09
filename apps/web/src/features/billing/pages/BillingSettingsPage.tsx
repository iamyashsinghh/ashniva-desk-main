import { TAX_TREATMENT_LABELS, type BillingProfile, type TaxTreatment } from '@ashniva/types';
import { Button, Card, FormField, Input, PageHeader, Select, Switch, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { useReauth } from '../../auth/reauth';
import { useBillingMutations, useBillingProfileQuery } from '../api';
import { BillingIdentityFields } from '../components/BillingIdentityFields';
import { ClientBillingCard } from '../components/ClientBillingCard';
import { billingFormFrom, billingPayloadFrom, type BillingProfileForm } from '../form';

import '../billing.css';

const TREATMENTS = Object.keys(TAX_TREATMENT_LABELS) as TaxTreatment[];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Who the invoice is from, how it is numbered, and who each one is billed to. */
export function BillingSettingsPage() {
  const query = useBillingProfileQuery();

  return (
    <div className="billing-page">
      <PageHeader
        title="Billing"
        subtitle="Your legal details, GST registration, invoice numbering and who each invoice is billed to"
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Loaded profile={query.data ?? null} />
      </QueryState>
      <ClientBillingCard />
    </div>
  );
}

function Loaded({ profile }: { profile: BillingProfile | null }) {
  const { saveProfile } = useBillingMutations();
  const reauth = useReauth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<BillingProfileForm>(() => billingFormFrom(profile));

  const valid =
    form.legalName.trim().length > 1 && /^\d{2}$/.test(form.stateCode) && form.email.includes('@');

  /**
   * The profile holds the bank account every invoice tells a client to pay into, so the API asks
   * for the password again. Without the prompt the save was a flat 403 for everybody.
   */
  const save = async () => {
    setError(null);
    setNotice(null);
    try {
      const token = await reauth.request();
      await saveProfile.mutateAsync({
        ...billingPayloadFrom(form),
        headers: reauth.headers(token),
      });
      setNotice('Billing details saved');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <BillingIdentityFields form={form} onChange={setForm} />

      <Card title="Invoice defaults">
        <div className="form-grid">
          <FormField label="Invoice prefix" hint="Gives INV/2026-27/0001">
            <Input
              value={form.invoicePrefix}
              onChange={(event) =>
                setForm({ ...form, invoicePrefix: event.target.value.toUpperCase() })
              }
            />
          </FormField>
          <FormField label="Payment terms (days)">
            <Input
              type="number"
              value={form.paymentTermsDays}
              onChange={(event) => setForm({ ...form, paymentTermsDays: event.target.value })}
            />
          </FormField>
          <FormField label="Default GST rate">
            <Input
              value={form.defaultTaxRate}
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, defaultTaxRate: event.target.value })}
            />
          </FormField>
          <FormField
            label="Financial year starts in"
            hint="Decides the year label on every invoice number — April gives 2026-27."
          >
            <Select
              value={form.financialYearStartMonth}
              onChange={(event) =>
                setForm({ ...form, financialYearStartMonth: event.target.value })
              }
              options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
            />
          </FormField>
          <FormField label="Default pricing">
            <Select
              value={form.defaultTaxTreatment}
              onChange={(event) =>
                setForm({ ...form, defaultTaxTreatment: event.target.value as TaxTreatment })
              }
              options={TREATMENTS.map((value) => ({
                value,
                label: TAX_TREATMENT_LABELS[value],
              }))}
            />
          </FormField>
          <Switch
            label="Round totals to the rupee"
            description="Shows the difference as its own line, as Indian invoices normally do"
            checked={form.roundTotals}
            onChange={(checked) => setForm({ ...form, roundTotals: checked })}
          />
        </div>
        {profile ? (
          <p className="muted">
            Next invoice number: {profile.invoicePrefix}/{profile.sequenceYear || 'new year'}/
            {String(profile.nextSequence).padStart(4, '0')}. The sequence is advanced when an
            invoice is issued and cannot be edited here.
          </p>
        ) : null}
      </Card>

      <Card title="Printed on every invoice">
        <div className="form-grid">
          <FormField label="Bank and payment details">
            <Textarea
              rows={3}
              value={form.bankDetails}
              placeholder="HDFC Bank · A/C 50200012345678 · IFSC HDFC0001234 · UPI ashniva@hdfc"
              onChange={(event) => setForm({ ...form, bankDetails: event.target.value })}
            />
          </FormField>
          <FormField label="Terms">
            <Textarea
              rows={3}
              value={form.terms}
              onChange={(event) => setForm({ ...form, terms: event.target.value })}
            />
          </FormField>
          <FormField label="Internal notes" hint="Never printed or sent to a client">
            <Textarea
              rows={2}
              value={form.internalNotes}
              onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
            />
          </FormField>
        </div>
        <div className="detail-actions">
          <Button
            variant="primary"
            loading={saveProfile.isPending}
            disabled={!valid}
            disabledReason="A legal name, a two-digit state code and an email are required"
            onClick={() => void save()}
          >
            Save billing details
          </Button>
        </div>
        <p className="muted">
          Saving these details changes the account clients are told to pay into, so you will be
          asked for your password.
        </p>
        {notice ? <p className="messaging-notice">{notice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </Card>
      {reauth.modal}
    </>
  );
}
