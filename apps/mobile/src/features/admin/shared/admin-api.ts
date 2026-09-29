import { REAUTH_HEADER, type OrganizationOption, type ReauthResponse } from '@ashniva/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
  ApiError,
  apiRequest,
  errorMessage,
  type QueryParams,
  type RequestOptions,
} from '../../../shared/api/client';
import type { ApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { getAccessToken } from '../../auth/session-store';

/**
 * The administration screens' reads and writes that the shared hooks do not cover.
 *
 * `useApiMutation` sends neither a query string nor extra headers, and administration needs both:
 * a membership in another company is addressed with `?organizationId=`, and every permission
 * change carries the short-lived re-auth token in `x-reauth-token`. This hook is the same contract
 * — never throws, the reason as a sentence, invalidation declared — with those two added.
 */

export type ReauthHeaders = Record<string, string>;

export interface AdminMutationOptions<TVariables, TResult> {
  path: (variables: TVariables) => string;
  method?: NonNullable<RequestOptions['method']>;
  body?: (variables: TVariables) => unknown;
  query?: (variables: TVariables) => QueryParams;
  headers?: (variables: TVariables) => ReauthHeaders | undefined;
  invalidate?: readonly (readonly unknown[])[];
  onSuccess?: (result: TResult, variables: TVariables) => void;
}

export function useAdminMutation<TVariables, TResult = void>(
  options: AdminMutationOptions<TVariables, TResult>,
): ApiMutation<TVariables, TResult> {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);
  const { path, method = 'POST', body, query, headers, invalidate, onSuccess } = options;

  const mutation = useMutation<TResult, unknown, TVariables>({
    mutationFn: (variables) => {
      const extraHeaders = headers?.(variables);
      return apiRequest<TResult>(path(variables), {
        method,
        ...(body ? { body: body(variables) } : {}),
        ...(query ? { query: query(variables) } : {}),
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      });
    },
  });
  const { mutateAsync } = mutation;

  const run = useCallback(
    async (variables: TVariables): Promise<TResult | null> => {
      setError(null);
      setCause(null);
      try {
        const result = await mutateAsync(variables);
        await Promise.all(
          (invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
        onSuccess?.(result, variables);
        return result;
      } catch (failure) {
        setError(errorMessage(failure));
        setCause(failure);
        return null;
      }
    },
    [mutateAsync, invalidate, onSuccess, queryClient],
  );

  return {
    run,
    busy: mutation.isPending,
    error,
    cause,
    reset: useCallback(() => {
      setError(null);
      setCause(null);
    }, []),
  };
}

const WRONG_PASSWORD = 'Password is incorrect';

/**
 * Confirms the signed-in person's password and returns the header the sensitive routes demand.
 *
 * A wrong password is a 401, and `apiRequest` reads every 401 as an expired session: it spends the
 * refresh token and, with none stored, clears the session — a typo would sign the admin out. So
 * the check is sent without that handling first, and only a 401 that is *not* the wrong-password
 * answer goes round again through the normal path, where an expired token is refreshed.
 */
export async function reauthenticate(password: string): Promise<ReauthHeaders> {
  const request = { method: 'POST', body: { password } } as const;
  const token = getAccessToken();
  let response: ReauthResponse;
  try {
    response = await apiRequest<ReauthResponse>('/auth/reauth', {
      ...request,
      skipAuth: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (failure) {
    if (
      !(failure instanceof ApiError) ||
      failure.status !== 401 ||
      failure.message === WRONG_PASSWORD
    ) {
      throw failure;
    }
    response = await apiRequest<ReauthResponse>('/auth/reauth', request);
  }
  return { [REAUTH_HEADER]: response.reauthToken };
}

/**
 * The organization id to send, or nothing for the caller's own.
 *
 * The API defaults every administration route to the caller's organization, so the own-company
 * case sends no parameter and shares its cache entry with every other screen that asked the same.
 */
export function scopeOf(organizationId: string | undefined, ownId: string | undefined) {
  return organizationId && organizationId !== ownId ? organizationId : undefined;
}

/** Company names for the switcher. Only the provider's staff pick a company; a client has one. */
export function useOrganizationOptions(enabled: boolean) {
  return useResource<OrganizationOption[]>(['organizations', 'options'], '/organizations/options', {
    enabled,
  });
}
