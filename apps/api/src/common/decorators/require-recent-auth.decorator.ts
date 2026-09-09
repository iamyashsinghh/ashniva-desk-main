import { SetMetadata } from '@nestjs/common';

export const REQUIRE_RECENT_AUTH_KEY = 'requireRecentAuth';

/** Error message the guard answers with; the web app opens the password prompt when it sees it. */
export const REAUTH_REQUIRED_MESSAGE = 'Confirm your password to continue';

/**
 * Marks a route as a sensitive change: besides the bearer token, the request must carry a fresh
 * re-authentication token (POST /auth/reauth) in the X-Reauth-Token header.
 */
export const RequireRecentAuth = () => SetMetadata(REQUIRE_RECENT_AUTH_KEY, true);
