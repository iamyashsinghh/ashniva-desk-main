import type { BillingProfile, ClientBillingProfile, InvoiceDetail } from '@ashniva/types';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Section, StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Button, Field, Input, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useClientOptions } from '../projects/project-form-options';
import { BILLING_INVALIDATES, type InvoiceInput, type InvoiceUpdate } from './billing-api';
import { createPayload, formProblem, updatePayload, type InvoiceForm } from './invoice-form';
import { InvoicePartyFields } from './InvoicePartyFields';
import { InvoiceSupplyFields } from './InvoiceSupplyFields';
import { InvoiceTotalsCard } from './InvoiceTotalsCard';
import { LineItemsSection } from './LineItemsSection';
import { useInvoicePreview } from './use-invoice-preview';

/**
 * The editor's body once everything it starts from has loaded: the web editor's sections, top to
 * bottom, with the server-calculated preview under the lines and "Save draft" pinned at the foot.
 *
 * Saving is blocked, with the reason on the bar, while any line is incomplete: a half-typed line
 * would otherwise be dropped or refused, and somebody could invoice for less than they meant to.
 */
export function InvoiceEditorForm({
  initial,
  invoiceId,
  profile,
  clientProfiles,
  onSaved,
  header,
}: {
  initial: InvoiceForm;
  invoiceId: string | null;
  profile: BillingProfile | null;
  clientProfiles: readonly ClientBillingProfile[];
  onSaved: (invoice: InvoiceDetail) => void;
  header?: ReactNode;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const clients = useClientOptions();
  const [form, setForm] = useState(initial);
  const editing = invoiceId !== null;
  const { preview, calculating, error: previewError } = useInvoicePreview(form);

  const save = useApiMutation<InvoiceInput | InvoiceUpdate, InvoiceDetail>({
    path: editing ? `/invoices/${invoiceId}` : '/invoices',
    method: editing ? 'PATCH' : 'POST',
    body: (variables) => variables,
    invalidate: BILLING_INVALIDATES,
    onSuccess: onSaved,
  });

  const patch = (change: Partial<InvoiceForm>) => {
    save.reset();
    setForm((current) => {
      const next = { ...current, ...change };
      // The client's recorded bill-to address is where the supply usually is, so a new invoice
      // starts from it — only when nothing has been typed there yet.
      const billTo = change.clientOrganizationId
        ? clientProfiles.find((row) => row.clientOrganizationId === change.clientOrganizationId)
        : undefined;
      if (billTo && !current.placeOfSupplyState && !current.placeOfSupplyCode) {
        next.placeOfSupplyState = billTo.state;
        next.placeOfSupplyCode = billTo.stateCode;
      }
      return next;
    });
  };

  const problem = profile ? formProblem(form) : 'Your billing details have to be saved first';
  const submit = () => void save.run(editing ? updatePayload(form) : createPayload(form));

  let note: ReactNode = null;
  if (save.error) {
    note = (
      <Banner tone="danger" role="alert">
        {save.error}
      </Banner>
    );
  } else if (problem) {
    note = (
      <AppText size="xs" tone="muted">
        {problem}
      </AppText>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          {header}
          <AppText size="sm" tone="muted">
            Saved as a draft; the number is assigned when it is issued.
          </AppText>
          <InvoicePartyFields
            form={form}
            onPatch={patch}
            clients={clients.options}
            clientsLoading={clients.isLoading}
            editing={editing}
            paymentTermsDays={profile?.paymentTermsDays ?? 30}
          />
          <InvoiceSupplyFields
            form={form}
            onPatch={patch}
            ownStateCode={profile?.stateCode ?? null}
          />
          <LineItemsSection
            lines={form.lines}
            onChange={(lines) => patch({ lines })}
            defaultTaxRate={profile ? profile.defaultTaxRate : '18'}
            preview={preview}
          />
          {preview ? (
            <InvoiceTotalsCard
              title="Preview"
              totals={preview}
              currency={profile?.currency ?? 'INR'}
              amountInWords={preview.amountInWords}
              taxBreakdown={preview.taxBreakdown}
            />
          ) : (
            <Section title="Preview" icon="calculator-outline">
              <AppText size="sm" tone="muted">
                {calculating
                  ? 'Calculating…'
                  : 'Add a complete line and a place of supply to see what this comes to. The figures are calculated by the server, not on this phone.'}
              </AppText>
            </Section>
          )}
          {previewError ? (
            <Banner tone="warning" title="The preview could not be calculated">
              {errorMessage(previewError)}
            </Banner>
          ) : null}
          <Section title="Notes" icon="chatbox-outline">
            <Field label="Notes for the client" hint="Printed on the invoice">
              <Input
                accessibilityLabel="Notes for the client"
                value={form.notes}
                onChangeText={(notes) => patch({ notes })}
                multiline
                maxLength={2000}
                style={{ minHeight: 72 }}
              />
            </Field>
            <Field label="Internal notes" hint="Never printed or sent">
              <Input
                accessibilityLabel="Internal notes"
                value={form.internalNotes}
                onChangeText={(internalNotes) => patch({ internalNotes })}
                multiline
                maxLength={2000}
                style={{ minHeight: 72 }}
              />
            </Field>
          </Section>
        </ScrollView>
        <StickyActionBar note={note}>
          <Button
            label={editing ? 'Save changes' : 'Save draft'}
            icon="save-outline"
            loading={save.busy}
            disabled={problem !== null}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
