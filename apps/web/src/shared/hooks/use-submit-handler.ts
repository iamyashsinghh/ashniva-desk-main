import { useState } from 'react';

import { errorMessage } from '../lib/api-client';

/** Runs a mutation from a modal: clears the error, runs onSuccess, shows the API message on failure. */
export function useSubmitHandler(onSuccess?: () => void) {
  const [error, setError] = useState<string | undefined>();
  const wrap = (work: () => Promise<unknown>) => async () => {
    setError(undefined);
    try {
      await work();
      onSuccess?.();
    } catch (cause) {
      const message = errorMessage(cause);
      if (message === 'Password confirmation cancelled') {
        return;
      }
      setError(message);
    }
  };
  return { error, wrap };
}
