import type { InvoiceStatus, PaginatedResponse, PaymentMethod, TaxTreatment } from '@ashniva/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiRequest, type QueryParams } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';

/**
 * The provider's billing endpoints, as this feature calls them.
 *
 * Money is a string the whole way through — typed as one, sent as one, printed as one. Nothing in
 * this folder parses an amount into a JavaScript number, which is how a total ends up a paisa out.
 */

export const billingKeys = {
  all: ['billing'] as const,
  profile: ['billing', 'profile'] as const,
  clientProfiles: ['billing', 'client-profiles'] as const,
  invoices: (params: object) => ['billing', 'invoices', params] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
  payments: (params: object) => ['billing', 'payments', params] as const,
};

/**
 * What a billing write makes stale: every billing list and record, and the client portal's copy of
 * the same invoices, which a client may be looking at on another phone of this app.
 */
export const BILLING_INVALIDATES = [billingKeys.all, ['portal']] as const;

export interface InvoiceListParams {
  status?: readonly InvoiceStatus[];
  search?: string;
}

/** One invoice line as the API takes it. */
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
  contractId?: string;
  issueDate: string;
  dueDate?: string;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  taxTreatment: TaxTreatment;
  reverseCharge: boolean;
  notes?: string;
  internalNotes?: string;
  lines: InvoiceLineInput[];
}

/** The PATCH body: the client and contract are fixed once a draft exists. */
export type InvoiceUpdate = Omit<InvoiceInput, 'clientOrganizationId' | 'contractId'>;

export interface CalculateInput {
  lines: InvoiceLineInput[];
  placeOfSupplyCode: string;
  taxTreatment: TaxTreatment;
  reverseCharge: boolean;
  isExport?: boolean;
  isExempt?: boolean;
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

export interface PagedWithTotal<T> {
  items: T[];
  /** How many match, across every page — the list's own count, not the rows loaded so far. */
  total: number | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: unknown;
  refresh: () => void;
  loadMore: () => void;
}

/**
 * A cursor-paged list that keeps the API's `total`.
 *
 * The shared `usePagedResource` flattens the pages and drops the count; the invoice and payment
 * lists say how many are in the view, as the web pages do, so they need it kept.
 */
export function usePagedWithTotal<T>(
  key: readonly unknown[],
  path: string,
  query: QueryParams = {},
  enabled = true,
): PagedWithTotal<T> {
  const result = useInfiniteQuery<PaginatedResponse<T>>({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      apiRequest<PaginatedResponse<T>>(path, {
        query: { ...query, ...(pageParam ? { cursor: String(pageParam) } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    retry: shouldRetry,
  });

  const items = useMemo(
    () => (result.data?.pages ?? []).flatMap((page) => page.items),
    [result.data],
  );

  return {
    items,
    total: result.data?.pages[0]?.total ?? null,
    isLoading: result.isLoading,
    isRefreshing: result.isRefetching && !result.isFetchingNextPage,
    isLoadingMore: result.isFetchingNextPage,
    error: items.length > 0 ? null : result.error,
    refresh: () => void result.refetch(),
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage) {
        void result.fetchNextPage();
      }
    },
  };
}
