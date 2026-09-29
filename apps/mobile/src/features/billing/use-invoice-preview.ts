import type { CalculationPreview } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import { useDebounced } from '../../shared/components/FilterSheet';
import { calculateInput, canPreview, type InvoiceForm } from './invoice-form';

/**
 * The editor's totals, calculated by the server — never by arithmetic on the phone: the figures on
 * a tax document have to come from one place, and that place is the API.
 *
 * Debounced, so typing a price does not send a request per keystroke. A stale total is worse than
 * none, so nothing is returned while the inputs on screen differ from the ones it was calculated
 * from.
 */
export function useInvoicePreview(form: InvoiceForm) {
  const ready = canPreview(form);
  const current = ready ? JSON.stringify(calculateInput(form)) : null;
  const settled = useDebounced(current, 400);

  const query = useQuery<CalculationPreview>({
    queryKey: ['billing', 'preview', settled],
    queryFn: () =>
      apiRequest<CalculationPreview>('/invoices/calculate', {
        method: 'POST',
        body: JSON.parse(settled ?? '{}') as unknown,
      }),
    enabled: settled !== null,
    retry: shouldRetry,
    staleTime: Infinity,
  });

  const fresh = current !== null && current === settled;
  return {
    preview: fresh ? (query.data ?? null) : null,
    calculating: current !== null && (!fresh || query.isFetching),
    error: fresh ? query.error : null,
  };
}
