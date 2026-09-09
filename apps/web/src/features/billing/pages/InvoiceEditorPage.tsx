import { TAX_TREATMENT_LABELS, type CalculationPreview, type TaxTreatment } from '@ashniva/types';
import { Button, Card, FormField, Input, PageHeader, Select, Switch, Textarea } from '@ashniva/ui';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { todayIso } from '../../../shared/lib/format';
import { useOrganizationsQuery } from '../../users/api';
import { useBillingProfileQuery, useBillingMutations, type InvoiceLineInput } from '../api';
import { InvoiceLinesEditor } from '../components/InvoiceLinesEditor';
import { InvoiceTotals } from '../components/InvoiceTotals';

import '../billing.css';

const TREATMENTS = Object.keys(TAX_TREATMENT_LABELS) as TaxTreatment[];

const emptyLine = (): InvoiceLineInput => ({
  description: '',
  hsnSac: '',
  quantity: '1',
  unit: 'Nos',
  unitPrice: '',
  taxRate: '18',
});

/**
 * Creating an invoice.
 *
 * The preview comes from the API, never from arithmetic in the browser: the figures on a tax
 * document have to come from one place, and that place is the server.
 */
export function InvoiceEditorPage() {
  const navigate = useNavigate();
  const profile = useBillingProfileQuery();
  const organizations = useOrganizationsQuery(true);
  const { create, calculate } = useBillingMutations();

  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalculationPreview | null>(null);
  const [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [form, setForm] = useState({
    clientOrganizationId: '',
    issueDate: todayIso(),
    dueDate: '',
    placeOfSupplyState: '',
    placeOfSupplyCode: '',
    taxTreatment: 'EXCLUSIVE' as TaxTreatment,
    reverseCharge: false,
    notes: '',
    internalNotes: '',
  });

  const complete = lines.filter((line) => line.description.trim() && line.unitPrice.trim());
  // A row with something typed in it but not enough to bill. It is excluded from the preview and
  // from what is saved, which is right — but saving silently while it sits on screen would let
  // somebody invoice for less than they meant to and not find out. Saving is blocked instead.
  const started = lines.filter((line) => line.description.trim() || line.unitPrice.trim());
  const incomplete = started.length - complete.length;
  const canPreview = complete.length > 0 && /^\d{2}$/.test(form.placeOfSupplyCode);
  const valid = canPreview && incomplete === 0 && Boolean(form.clientOrganizationId);
  const linesKey = JSON.stringify(complete);

  // A stale total is worse than none, so the preview is shown only while the inputs it was
  // calculated from are still complete. Deriving it here rather than clearing the state in the
  // effect keeps the effect free of synchronous renders.
  const shownPreview = canPreview ? preview : null;

  // Recalculates whenever the lines or the tax settings change. Debounced so a keystroke does
  // not produce a request per character.
  useEffect(() => {
    if (!canPreview) {
      return;
    }
    const timer = setTimeout(() => {
      calculate
        .mutateAsync({
          lines: complete,
          placeOfSupplyCode: form.placeOfSupplyCode,
          taxTreatment: form.taxTreatment,
          reverseCharge: form.reverseCharge,
        })
        .then(setPreview)
        .catch((cause: unknown) => setError(errorMessage(cause)));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `calculate` is a stable mutation.
  }, [linesKey, form.placeOfSupplyCode, form.taxTreatment, form.reverseCharge, canPreview]);

  const save = async () => {
    setError(null);
    try {
      const created = await create.mutateAsync({
        clientOrganizationId: form.clientOrganizationId,
        issueDate: form.issueDate,
        dueDate: form.dueDate || undefined,
        placeOfSupplyState: form.placeOfSupplyState.trim(),
        placeOfSupplyCode: form.placeOfSupplyCode,
        taxTreatment: form.taxTreatment,
        reverseCharge: form.reverseCharge,
        notes: form.notes.trim() || undefined,
        internalNotes: form.internalNotes.trim() || undefined,
        lines: complete,
      });
      await navigate(`/invoices/${created.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const clients = (organizations.data ?? []).filter((row) => !row.isServiceProvider);

  return (
    <div className="billing-page">
      <PageHeader
        title="New invoice"
        subtitle="Saved as a draft; the number is assigned when you issue it"
        actions={
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!valid}
            disabledReason={
              incomplete > 0
                ? 'Every line needs a description and a price, or remove it'
                : 'Pick a client, a place of supply and at least one line'
            }
            onClick={() => void save()}
          >
            Save draft
          </Button>
        }
      />

      {!profile.data ? (
        <Card title="Set up billing first">
          <p className="muted">
            An invoice needs your own legal name, address, state code and GSTIN before it can be
            raised.
          </p>
          <Button onClick={() => void navigate('/settings/billing')}>Open billing settings</Button>
        </Card>
      ) : null}

      <div className="billing-page__columns">
        <div className="billing-page__main">
          <Card title="Client and dates">
            <div className="form-grid">
              <FormField label="Client" required>
                <Select
                  value={form.clientOrganizationId}
                  placeholder="Choose a client"
                  onChange={(event) =>
                    setForm({ ...form, clientOrganizationId: event.target.value })
                  }
                  options={clients.map((row) => ({ value: row.id, label: row.name }))}
                />
              </FormField>
              <FormField label="Issue date" required>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(event) => setForm({ ...form, issueDate: event.target.value })}
                />
              </FormField>
              <FormField
                label="Due date"
                hint={`Defaults to ${profile.data?.paymentTermsDays ?? 30} days`}
              >
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                />
              </FormField>
            </div>
          </Card>

          <Card title="Place of supply">
            <p className="muted">
              Decides whether GST splits into CGST and SGST or is charged as IGST. Your own state
              code is {profile.data?.stateCode ?? '—'}.
            </p>
            <div className="form-grid">
              <FormField label="State" required>
                <Input
                  value={form.placeOfSupplyState}
                  placeholder="Maharashtra"
                  onChange={(event) => setForm({ ...form, placeOfSupplyState: event.target.value })}
                />
              </FormField>
              <FormField label="State code" required hint="Two digits, e.g. 27">
                <Input
                  value={form.placeOfSupplyCode}
                  inputMode="numeric"
                  maxLength={2}
                  onChange={(event) => setForm({ ...form, placeOfSupplyCode: event.target.value })}
                />
              </FormField>
              <FormField label="Pricing">
                <Select
                  value={form.taxTreatment}
                  onChange={(event) =>
                    setForm({ ...form, taxTreatment: event.target.value as TaxTreatment })
                  }
                  options={TREATMENTS.map((value) => ({
                    value,
                    label: TAX_TREATMENT_LABELS[value],
                  }))}
                />
              </FormField>
              <Switch
                label="Reverse charge"
                description="The client pays the GST directly; it is shown but not collected"
                checked={form.reverseCharge}
                onChange={(checked) => setForm({ ...form, reverseCharge: checked })}
              />
            </div>
          </Card>

          <Card title="Lines">
            <InvoiceLinesEditor lines={lines} onChange={setLines} />
          </Card>

          <Card title="Notes">
            <div className="form-grid">
              <FormField label="Notes for the client" hint="Printed on the invoice">
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </FormField>
              <FormField label="Internal notes" hint="Never printed or sent">
                <Textarea
                  rows={2}
                  value={form.internalNotes}
                  onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
                />
              </FormField>
            </div>
          </Card>

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <div className="billing-page__aside">
          <Card title="Preview">
            {shownPreview ? (
              <InvoiceTotals
                totals={shownPreview}
                currency={profile.data?.currency ?? 'INR'}
                amountInWords={shownPreview.amountInWords}
                taxBreakdown={shownPreview.taxBreakdown}
              />
            ) : (
              <p className="muted">
                Add a line and a place of supply to see what this comes to. The figures are
                calculated by the server, not in this browser.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
