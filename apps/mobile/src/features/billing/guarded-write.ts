import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { apiRequest, errorMessage, type RequestOptions } from '../../shared/api/client';
import { reauthenticate } from '../admin/shared/admin-api';

/**
 * A billing write, optionally behind a fresh password check.
 *
 * Three billing writes are `@RequireRecentAuth()` on the API: saving the billing profile (it
 * carries the bank account every invoice tells a client to pay into), voiding an issued invoice,
 * and recording a payment. Each needs a short-lived token from `POST /auth/reauth` in the
 * `x-reauth-token` header, or the API answers 403.
 *
 * The web app raises a password dialog on top of whatever dialog is open. A phone cannot stack two
 * modal sheets reliably, so here the password is a field in the sheet or form that makes the
 * change, and this hook confirms it and sends the write in one step. A null password sends the
 * write without a token — for the one write in a shared sheet that does not need it (cancelling a
 * draft nobody was sent).
 *
 * The password check is the admin area's `reauthenticate`, which keeps a mistyped password (a 401)
 * from being read as an expired session and signing the person out.
 *
 * Like `useApiMutation`, `run` never rejects: it resolves with the result or null, and the reason
 * is in `error`.
 */

interface GuardedWriteOptions<TVariables, TResult> {
  path: string | ((variables: TVariables) => string);
  method?: NonNullable<RequestOptions['method']>;
  body?: (variables: TVariables) => unknown;
  invalidate?: readonly (readonly unknown[])[];
  onSuccess?: (result: TResult, variables: TVariables) => void;
}

export interface GuardedWrite<TVariables, TResult> {
  run: (variables: TVariables, password: string | null) => Promise<TResult | null>;
  busy: boolean;
  error: string | null;
  reset: () => void;
}

export function useGuardedWrite<TVariables, TResult>(
  options: GuardedWriteOptions<TVariables, TResult>,
): GuardedWrite<TVariables, TResult> {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { path, method = 'POST', body, invalidate, onSuccess } = options;

  const mutation = useMutation<
    TResult,
    unknown,
    { variables: TVariables; password: string | null }
  >({
    mutationFn: async ({ variables, password }) => {
      const headers = password === null ? undefined : await reauthenticate(password);
      return apiRequest<TResult>(typeof path === 'function' ? path(variables) : path, {
        method,
        ...(body ? { body: body(variables) } : {}),
        ...(headers ? { headers } : {}),
      });
    },
  });
  const { mutateAsync } = mutation;

  const run = useCallback(
    async (variables: TVariables, password: string | null): Promise<TResult | null> => {
      setError(null);
      try {
        const result = await mutateAsync({ variables, password });
        await Promise.all(
          (invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
        onSuccess?.(result, variables);
        return result;
      } catch (failure) {
        setError(errorMessage(failure));
        return null;
      }
    },
    [mutateAsync, invalidate, onSuccess, queryClient],
  );

  return {
    run,
    busy: mutation.isPending,
    error,
    reset: useCallback(() => setError(null), []),
  };
}
