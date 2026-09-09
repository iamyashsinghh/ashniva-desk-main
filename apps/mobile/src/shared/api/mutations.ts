import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { apiRequest, errorMessage, type RequestOptions } from './client';

/**
 * Writes.
 *
 * `queries.ts` covers reading; this covers the other direction, and exists because the pattern it
 * replaces was being copied. Every write was an `apiRequest` wrapped in a hand-rolled `busy` flag,
 * a `try/catch`, a `setError(errorMessage(cause))` and a `finally` — five lines of ceremony per
 * button, each of which is one edit away from leaving the spinner on after a failure.
 *
 * Three decisions worth naming:
 *
 * **It does not throw.** `run` resolves with the result or with null, and puts the reason in
 * `error`. A screen that has to wrap every call in a `try` in order not to crash the app is a
 * screen where somebody will eventually forget, and an unhandled rejection in React Native is a
 * red box over whatever the person was doing.
 *
 * **Invalidation is declared, not remembered.** The keys a write makes stale are named where the
 * write is defined, so a new action cannot quietly leave a list showing the old status.
 *
 * **The error is a sentence, not an exception.** `errorMessage` already knows how to get the
 * API's own words out of a failure; screens render the string.
 */

export interface ApiMutation<TVariables, TResult> {
  /** Runs the write. Resolves with the result, or null when it failed. Never rejects. */
  run: (variables: TVariables) => Promise<TResult | null>;
  /** True while the request is in flight. Drives the button's spinner and disabled state. */
  busy: boolean;
  /** Why the last attempt failed, in words worth showing. Null when there is nothing to say. */
  error: string | null;
  /**
   * The failure itself, for the rare caller that has to branch on *which* refusal it was.
   *
   * The sentence is enough for almost every screen and is what should be rendered; this is for the
   * case where the response changes what the screen offers next rather than only what it says —
   * the composer, which on a 400 about a mention offers to send the message without it. Branching
   * on `ApiError.status` is the point; matching on the sentence would not be.
   */
  cause: unknown;
  /** Clears the message — for a form that has been edited since the failure. */
  reset: () => void;
}

export interface ApiMutationOptions<TVariables, TResult> {
  /** The path, or a function of the variables when the id is one of them. */
  path: string | ((variables: TVariables) => string);
  method?: NonNullable<RequestOptions['method']>;
  /** The request body, from the variables. Omit for a write that sends nothing. */
  body?: (variables: TVariables) => unknown;
  /** Query keys made stale by this write. Each is invalidated on success. */
  invalidate?: readonly (readonly unknown[])[];
  /** Run after a successful write, before the caller's `run` resolves. */
  onSuccess?: (result: TResult, variables: TVariables) => void;
}

export function useApiMutation<TVariables = void, TResult = void>(
  options: ApiMutationOptions<TVariables, TResult>,
): ApiMutation<TVariables, TResult> {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);
  const { path, method = 'POST', body, invalidate, onSuccess } = options;

  const mutation = useMutation<TResult, unknown, TVariables>({
    mutationFn: (variables) =>
      apiRequest<TResult>(typeof path === 'function' ? path(variables) : path, {
        method,
        ...(body ? { body: body(variables) } : {}),
      }),
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
