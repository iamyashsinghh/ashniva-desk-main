import type { PermissionKey } from '../permissions/permission-keys';
import type { RoleKey } from '../roles/role-keys';

/**
 * Claims carried by the JWT access token. Kept small: permissions are resolved from the role
 * on each request so role changes take effect without waiting for token expiry.
 *
 * There is deliberately no "preview as this role" claim. One was declared here and copied into
 * the principal by the JWT guard, but nothing ever signed it and no authorization decision ever
 * read it — a role-shaped field travelling from a token into the principal, waiting for the first
 * reader to treat it as the role the request runs as. A preview feature, if it is ever built, is
 * a server-side decision about what to *show*, never a claim the token carries.
 */
export interface AccessTokenClaims {
  /** User id */
  sub: string;
  /** Organization the token is scoped to (tenant) */
  organizationId: string;
  roleKey: RoleKey;
}

/** The authenticated principal attached to each request after the JWT guard runs. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  roleKey: RoleKey;
  permissions: readonly PermissionKey[];
  /** True for members of the company that runs the system (internal staff). */
  isServiceProvider: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
}
