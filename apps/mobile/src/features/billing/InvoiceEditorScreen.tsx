import {
  PERMISSIONS,
  isInvoiceEditable,
  type BillingProfile,
  type ClientBillingProfile,
  type InvoiceDetail,
} from '@ashniva/types';
import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Button, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useSession } from '../auth/SessionProvider';
import { billingKeys } from './billing-api';
import { InvoiceEditorForm } from './InvoiceEditorForm';
import { formFromInvoice, newInvoiceForm } from './invoice-form';

/**
 * Creating an invoice, or changing a draft — the web's editor.
 *
 * Only a draft can be edited: once issued, an invoice is a tax document and the API refuses the
 * PATCH, so an issued one opened here says so instead of offering a form that cannot save. An
 * invoice needs the provider's own billing profile; without it the screen points at the settings
 * rather than letting somebody fill in a form the API will refuse.
 */
export function InvoiceEditorScreen({
  invoiceId,
  onSaved,
  onOpenSettings,
}: {
  invoiceId: string | null;
  onSaved: (invoice: InvoiceDetail, created: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { can } = useSession();
  const profile = useResource<BillingProfile | null>(billingKeys.profile, '/settings/billing');
  const clientProfiles = useResource<ClientBillingProfile[]>(
    billingKeys.clientProfiles,
    '/settings/billing/clients',
  );
  const invoice = useResource<InvoiceDetail>(
    billingKeys.invoice(invoiceId ?? ''),
    `/invoices/${invoiceId ?? ''}`,
    { enabled: invoiceId !== null },
  );

  const failure = profile.error ?? (invoiceId ? invoice.error : null);
  if (failure) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(failure)}
          offline={failure instanceof Error && failure.name === 'NetworkError'}
          onRetry={() => {
            void profile.refetch();
            if (invoiceId) {
              void invoice.refetch();
            }
          }}
        />
      </Screen>
    );
  }
  if (profile.isLoading || (invoiceId && !invoice.data)) {
    return (
      <Screen>
        <LoadingState label={invoiceId ? 'Loading the draft' : 'Loading billing settings'} />
      </Screen>
    );
  }

  if (invoice.data && !isInvoiceEditable(invoice.data.status)) {
    return (
      <Screen>
        <EmptyState
          title="Only a draft can be edited"
          description="This invoice has been issued. Void it and raise a new one to change what it says."
          icon="lock-closed-outline"
        />
      </Screen>
    );
  }

  const billing = profile.data ?? null;
  const initial = invoice.data
    ? formFromInvoice(invoice.data)
    : newInvoiceForm(billing ? { taxTreatment: billing.defaultTaxTreatment } : {});

  return (
    <InvoiceEditorForm
      // Remounted when the draft is reloaded, so the form starts from what the server now has.
      key={invoice.data?.updatedAt ?? 'new'}
      initial={initial}
      invoiceId={invoiceId}
      profile={billing}
      clientProfiles={clientProfiles.data ?? []}
      onSaved={(saved) => onSaved(saved, invoiceId === null)}
      header={
        billing ? null : (
          <Banner
            tone="warning"
            title="Set up billing first"
            action={
              can(PERMISSIONS.BILLING_PROFILE_MANAGE) ? (
                <Button
                  label="Open billing settings"
                  size="sm"
                  variant="secondary"
                  onPress={onOpenSettings}
                />
              ) : undefined
            }
          >
            An invoice needs your own legal name, address, state code and GSTIN before it can be
            raised.
          </Banner>
        )
      }
    />
  );
}
