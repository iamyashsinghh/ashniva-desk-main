import type {
  BillingProfile,
  CalculationPreview,
  ClientBillingProfile,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  PaginatedResponse,
  PaymentMethod,
  PaymentSummary,
  PortalInvoiceDetail,
  PortalInvoiceSummary,
  TaxTreatment,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import { downloadFile } from '../files/api';

export const billingKeys = {
  all: ['billing'] as const,
  profile: () => ['billing', 'profile'] as const,
  clientProfiles: () => ['billing', 'client-profiles'] as const,
  invoices: (params: InvoiceListParams) => ['billing', 'invoices', params] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
  payments: () => ['billing', 'payments'] as const,
  portalInvoices: () => ['billing', 'portal', 'invoices'] as const,
  portalInvoice: (id: string) => ['billing', 'portal', 'invoice', id] as const,
};

export interface InvoiceListParams {
  status?: InvoiceStatus[];
  clientOrganizationId?: string;
  search?: string;
}

export function useBillingProfileQuery() {
  return useQuery({
    queryKey: billingKeys.profile(),
    queryFn: () => apiRequest<BillingProfile | null>('/settings/billing'),
  });
}

/** The provider's record of how each client is billed. Never exposed through the portal. */
export function useClientBillingProfilesQuery() {
  return useQuery({
    queryKey: billingKeys.clientProfiles(),
    queryFn: () => apiRequest<ClientBillingProfile[]>('/settings/billing/clients'),
  });
}

export function useInvoicesQuery(params: InvoiceListParams = {}) {
  return useQuery({
    queryKey: billingKeys.invoices(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<InvoiceSummary>>('/invoices', {
        query: {
          status: params.status?.join(','),
          clientOrganizationId: params.clientOrganizationId,
          search: params.search,
          limit: 100,
        },
      }),
  });
}

export function useInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: billingKeys.invoice(id ?? ''),
    queryFn: () => apiRequest<InvoiceDetail>(`/invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function usePaymentsQuery() {
  return useQuery({
    queryKey: billingKeys.payments(),
    queryFn: () =>
      apiRequest<PaginatedResponse<PaymentSummary>>('/payments', { query: { limit: 100 } }),
  });
}

export function usePortalInvoicesQuery() {
  return useQuery({
    queryKey: billingKeys.portalInvoices(),
    queryFn: () =>
      apiRequest<PaginatedResponse<PortalInvoiceSummary>>('/portal/invoices', {
        query: { limit: 100 },
      }),
  });
}

export function usePortalInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: billingKeys.portalInvoice(id ?? ''),
    queryFn: () => apiRequest<PortalInvoiceDetail>(`/portal/invoices/${id}`),
    enabled: Boolean(id),
  });
}

/** Money is sent as a string throughout; a JSON number is a double. */
export interface InvoiceLineInput {
  description: string;
  hsnSac?: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
  discountPercent?: string;
  discountAmount?: string;
  taxRate?: string;
}

export interface InvoiceInput {
  clientOrganizationId: string;
  projectId?: string;
  issueDate: string;
  dueDate?: string;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  taxTreatment?: TaxTreatment;
  reverseCharge?: boolean;
  isExport?: boolean;
  isExempt?: boolean;
  notes?: string;
  internalNotes?: string;
  lines: InvoiceLineInput[];
}

/** The "Bill to" particulars of one client. The client is in the path, not the body. */
export interface ClientBillingInput {
  clientOrganizationId: string;
  legalName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country?: string;
  gstin?: string;
}

export interface RecordPaymentInput {
  clientOrganizationId: string;
  reference: string;
  method: PaymentMethod;
  paidAt: string;
  amount: string;
  notes?: string;
  internalNotes?: string;
  allocations?: { invoiceId: string; amount: string }[];
  leaveUnallocated?: boolean;
}

/**
 * The short-lived re-authentication token, for the three billing writes the API guards with
 * `@RequireRecentAuth()`: saving the profile (it carries the payee bank account), voiding an
 * issued invoice, and recording a payment. Get them from `useReauth().headers(token)`.
 */
type ReauthHeaders = { headers?: Record<string, string> };

export function useBillingMutations(invoiceId?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: billingKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };

  return {
    saveProfile: useMutation({
      mutationFn: ({ headers, ...body }: Partial<BillingProfile> & ReauthHeaders) =>
        apiRequest<BillingProfile>('/settings/billing', { method: 'PUT', body, headers }),
      onSuccess: invalidate,
    }),
    saveClientProfile: useMutation({
      mutationFn: ({
        clientOrganizationId,
        headers,
        ...body
      }: ClientBillingInput & ReauthHeaders) =>
        apiRequest<ClientBillingProfile>(`/settings/billing/clients/${clientOrganizationId}`, {
          method: 'PUT',
          body,
          headers,
        }),
      onSuccess: invalidate,
    }),
    calculate: useMutation({
      mutationFn: (body: {
        lines: InvoiceLineInput[];
        placeOfSupplyCode: string;
        taxTreatment?: TaxTreatment;
        reverseCharge?: boolean;
      }) => apiRequest<CalculationPreview>('/invoices/calculate', { method: 'POST', body }),
    }),
    create: useMutation({
      mutationFn: (body: InvoiceInput) =>
        apiRequest<InvoiceDetail>('/invoices', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<InvoiceInput>) =>
        apiRequest<InvoiceDetail>(`/invoices/${invoiceId}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    issue: useMutation({
      mutationFn: () =>
        apiRequest<InvoiceDetail>(`/invoices/${invoiceId}/issue`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    close: useMutation({
      // Only `void` is guarded, so `headers` is optional: cancelling a draft nobody was sent must
      // not ask for a password it does not need.
      mutationFn: ({
        action,
        reason,
        headers,
      }: { action: 'cancel' | 'void'; reason: string } & ReauthHeaders) =>
        apiRequest<InvoiceDetail>(`/invoices/${invoiceId}/${action}`, {
          method: 'POST',
          body: { reason },
          headers,
        }),
      onSuccess: invalidate,
    }),
    reminder: useMutation({
      mutationFn: () =>
        apiRequest<InvoiceDetail>(`/invoices/${invoiceId}/reminder`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    recordPayment: useMutation({
      mutationFn: ({ headers, ...body }: RecordPaymentInput & ReauthHeaders) =>
        apiRequest<PaymentSummary>('/payments', { method: 'POST', body, headers }),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Downloads an invoice PDF.
 *
 * Two hops: the billing endpoint says which file holds the document, and the existing files
 * endpoint streams it after its own access check. Reusing that endpoint means the PDF is
 * subject to the same file permissions as every other attachment.
 */
export async function downloadInvoicePdf(
  invoiceId: string,
  numberLabel: string,
  portal = false,
): Promise<void> {
  const path = portal ? `/portal/invoices/${invoiceId}/pdf` : `/invoices/${invoiceId}/pdf`;
  const { fileId } = await apiRequest<{ fileId: string }>(path);
  await downloadFile({ id: fileId, name: `${numberLabel.replaceAll('/', '-')}.pdf` });
}
