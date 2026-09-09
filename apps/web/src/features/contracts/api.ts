import type {
  BillingPeriod,
  CarryForwardRule,
  ContractDetail,
  ContractHourBalance,
  ContractListView,
  ContractStatus,
  ContractSummary,
  ContractType,
  HourLedgerEntry,
  HourLedgerKind,
  PaginatedResponse,
  PaymentMilestoneStatus,
  PaymentMilestoneSummary,
  PortalContractDetail,
  PortalContractSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ContractListParams {
  view?: ContractListView;
  type?: ContractType;
  clientOrganizationId?: string;
  projectId?: string;
  search?: string;
}

export const contractKeys = {
  all: ['contracts'] as const,
  list: (params: ContractListParams) => ['contracts', 'list', params] as const,
  detail: (id: string) => ['contracts', 'detail', id] as const,
  ledger: (id: string, periodStart?: string) => ['contracts', 'ledger', id, periodStart] as const,
};

export function useContractsQuery(params: ContractListParams, enabled = true) {
  return useQuery({
    queryKey: contractKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<ContractSummary>>('/contracts', {
        query: { ...params, limit: 100 },
      }),
    enabled,
  });
}

export function useContractQuery(id: string | undefined) {
  return useQuery({
    queryKey: contractKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ContractDetail>(`/contracts/${id}`),
    enabled: Boolean(id),
  });
}

export function useLedgerQuery(id: string, periodStart?: string) {
  return useQuery({
    queryKey: contractKeys.ledger(id, periodStart),
    queryFn: () =>
      apiRequest<PaginatedResponse<HourLedgerEntry>>(`/contracts/${id}/ledger`, {
        query: { periodStart, limit: 100 },
      }),
  });
}

export interface ContractInput {
  clientOrganizationId: string;
  projectId?: string | null;
  type: ContractType;
  title: string;
  description?: string | null;
  scope?: string | null;
  status?: ContractStatus;
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
  renewalNoticeDays?: number;
  autoRenew?: boolean;
  currency?: string;
  contractValue?: string | null;
  internalCost?: string | null;
  includedMinutesPerPeriod?: number;
  billingPeriod?: BillingPeriod;
  carryForwardRule?: CarryForwardRule;
  carryForwardCapMinutes?: number | null;
  lowHoursThresholdMinutes?: number;
  internalNotes?: string | null;
  clientNotes?: string | null;
}

export interface HourMovementInput {
  kind: HourLedgerKind;
  minutes: number;
  reason: string;
  idempotencyKey?: string;
  ticketId?: string;
}

export interface PaymentMilestoneInput {
  title?: string;
  amount?: string;
  currency?: string;
  dueDate?: string | null;
  status?: PaymentMilestoneStatus;
  invoiceReference?: string | null;
  milestoneId?: string | null;
  sortOrder?: number;
}

export function useContractMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: contractKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: ContractInput) =>
        apiRequest<ContractDetail>('/contracts', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<ContractInput>) =>
        apiRequest<ContractDetail>(`/contracts/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: () => apiRequest<ContractDetail>(`/contracts/${id}/archive`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    /** Needs the re-authentication header (see useReauth). */
    moveHours: useMutation({
      mutationFn: ({ headers, ...body }: HourMovementInput & { headers: Record<string, string> }) =>
        apiRequest<ContractHourBalance>(`/contracts/${id}/hours`, {
          method: 'POST',
          body,
          headers,
        }),
      onSuccess: invalidate,
    }),
    addPayment: useMutation({
      mutationFn: (body: PaymentMilestoneInput & { title: string; amount: string }) =>
        apiRequest<PaymentMilestoneSummary>(`/contracts/${id}/payment-milestones`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    updatePayment: useMutation({
      mutationFn: ({ paymentId, ...body }: PaymentMilestoneInput & { paymentId: string }) =>
        apiRequest<PaymentMilestoneSummary>(`/contracts/${id}/payment-milestones/${paymentId}`, {
          method: 'PATCH',
          body,
        }),
      onSuccess: invalidate,
    }),
    removePayment: useMutation({
      mutationFn: (paymentId: string) =>
        apiRequest<void>(`/contracts/${id}/payment-milestones/${paymentId}`, {
          method: 'DELETE',
        }),
      onSuccess: invalidate,
    }),
  };
}

export function usePortalContractsQuery() {
  return useQuery({
    queryKey: ['portal', 'contracts'],
    queryFn: () => apiRequest<PortalContractSummary[]>('/portal/contracts'),
  });
}

export function usePortalContractQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['portal', 'contracts', id],
    queryFn: () => apiRequest<PortalContractDetail>(`/portal/contracts/${id}`),
    enabled: Boolean(id),
  });
}
