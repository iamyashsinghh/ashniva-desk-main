import { REAUTH_HEADER, type ReauthResponse } from '@ashniva/types';

import { apiRequest } from '../../shared/api/client';

/**
 * The fresh password check that recording support hours needs.
 *
 * `POST /contracts/:id/hours` is `@RequireRecentAuth()`: an hour balance is what the client is
 * billed against, so moving it asks for the password again and carries the short-lived token in
 * the `x-reauth-token` header. The web raises a password dialog over the form; a phone cannot stack
 * two sheets reliably, so the password is a field in the same sheet and this turns it into the
 * header just before the write.
 */
export async function reauthHeaders(password: string): Promise<Record<string, string>> {
  const response = await apiRequest<ReauthResponse>('/auth/reauth', {
    method: 'POST',
    body: { password },
  });
  return { [REAUTH_HEADER]: response.reauthToken };
}
