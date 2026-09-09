import type { Priority, SupportTier, TicketSource, TicketType } from '@ashniva/types';

/**
 * The calling product, as the ingress sees it after authentication.
 *
 * Everything the request is allowed to affect is here, resolved from the registry — which is the
 * point. A caller that could name its own organization or project could route its tickets to any
 * team in the product; a caller that names nothing but its own content cannot.
 */
export interface AuthenticatedProduct {
  productId: string;
  organizationId: string;
  code: string;
  name: string;
  projectId: string | null;
  clientOrganizationId: string;
  supportRequesterId: string | null;
  supportEnabled: boolean;
  autoRouteEnabled: boolean;
  ivrEnabled: boolean;
  supportTier: SupportTier;
  allowedSources: TicketSource[];
  allowedWorkAreas: string[];
  defaultPriority: Priority;
  defaultType: TicketType;
  /**
   * Which credential was presented. The public half only — the secret is never held anywhere.
   *
   * `credentialId` is null on a widget session: a browser presents a token minted *from* a
   * credential rather than the credential itself, so there is no credential row this request is
   * holding. The key id survives, because knowing which server credential a session descends from
   * is exactly what an audit trail needs.
   */
  credentialId: string | null;
  credentialKeyId: string;
  /** Browser origins this product's widget may run on. Empty means the widget is not enabled. */
  allowedOrigins: string[];
}

/**
 * A calling *browser*, as the widget routes see it after verifying a session token.
 *
 * The same product context, plus the two facts the token pins that a server credential does not:
 * which end user this session is for, and which origin it may be used from. Neither may be taken
 * from the request — a widget that could name its own requester could file tickets as anybody the
 * customer supports, and one that could name its own origin would not be origin-bound at all.
 */
export interface AuthenticatedWidget {
  product: AuthenticatedProduct;
  externalUserId: string;
  origin: string;
}
