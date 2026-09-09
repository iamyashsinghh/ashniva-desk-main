import { useState } from 'react';

import { errorMessage } from '../lib/api-client';

/** Runs a mutation from a modal: clears the error, closes on success, shows the API message on failure. */
export function useSubmitHandler(onClose: () => void) {
  const [error, setError] = useState<string | undefined>();
  const wrap = (work: () => Promise<unknown>) => async () => {
    setError(undefined);
    try {
      await work();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return { error, wrap };
}
