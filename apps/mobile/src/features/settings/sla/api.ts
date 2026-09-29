import type { SlaPolicySummary } from '@ashniva/types';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import type { SlaPolicyInput } from './sla-form';

/**
 * The SLA policy endpoints, all behind `sla:manage`.
 *
 * A policy write re-applies targets to the open tickets it governs, so tickets and dashboards are
 * made stale along with the policy list — as on the web.
 */

export const SLA_POLICIES_KEY = ['sla', 'policies'] as const;
const AFTER_POLICY_CHANGE = [['sla'], ['tickets'], ['dashboard']] as const;

export function useSlaPolicies(enabled: boolean) {
  return useResource<SlaPolicySummary[]>(SLA_POLICIES_KEY, '/sla/policies', { enabled });
}

export function useSaveSlaPolicy(
  policyId: string | null,
  onSuccess: (saved: SlaPolicySummary) => void,
) {
  return useApiMutation<SlaPolicyInput, SlaPolicySummary>({
    path: policyId ? `/sla/policies/${policyId}` : '/sla/policies',
    method: policyId ? 'PATCH' : 'POST',
    body: (input) => input,
    invalidate: AFTER_POLICY_CHANGE,
    onSuccess,
  });
}

export function useDeleteSlaPolicy(policyId: string, onSuccess: () => void) {
  return useApiMutation<void, void>({
    path: `/sla/policies/${policyId}`,
    method: 'DELETE',
    invalidate: AFTER_POLICY_CHANGE,
    onSuccess,
  });
}
