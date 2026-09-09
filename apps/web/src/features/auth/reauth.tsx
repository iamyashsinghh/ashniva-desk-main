import { REAUTH_HEADER } from '@ashniva/types';
import { useCallback, useState, type ReactNode } from 'react';

import { ReauthModal } from './ReauthModal';

interface Pending {
  resolve: (token: string) => void;
  reject: (reason: Error) => void;
}

/**
 * Sensitive changes (permissions, hour adjustments) need a fresh password check. `request()`
 * opens the prompt and resolves with the short-lived token; `headers(token)` adds it to the
 * API call. Render `modal` once in the page.
 */
export function useReauth(): {
  request: () => Promise<string>;
  headers: (token: string) => Record<string, string>;
  modal: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const request = useCallback(
    () => new Promise<string>((resolve, reject) => setPending({ resolve, reject })),
    [],
  );
  const modal = (
    <ReauthModal
      open={pending !== null}
      onCancel={() => {
        pending?.reject(new Error('Password confirmation cancelled'));
        setPending(null);
      }}
      onConfirmed={(token) => {
        pending?.resolve(token);
        setPending(null);
      }}
    />
  );
  return { request, headers: (token) => ({ [REAUTH_HEADER]: token }), modal };
}
