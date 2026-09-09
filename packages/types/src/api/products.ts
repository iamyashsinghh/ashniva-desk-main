import type { Priority } from '../domain/priority';
import type { SupportTier } from '../domain/product';
import type { TicketSource } from '../domain/ticket-source';
import type { TicketType } from '../domain/ticket-type';
import type { ClientVisibleStatus } from '../workflow/client-visible-status';
import type { UserRef } from './identity';

/** A registered product, as the admin screens read it. */
export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  supportEnabled: boolean;
  autoRouteEnabled: boolean;
  ivrEnabled: boolean;
  supportTier: SupportTier;
  project: { id: string; code: string; name: string } | null;
  /** How many credentials are live. The credentials themselves are a separate read. */
  activeCredentials: number;
  openTickets: number;
  updatedAt: string;
}

export interface ProductDetail extends ProductSummary {
  /** Sources this product may declare on an ingress request. Empty means every source. */
  allowedSources: TicketSource[];
  /** Work areas its tickets may name. Empty means any. */
  allowedWorkAreas: string[];
  /**
   * Browser origins the embedded support widget may run on.
   *
   * Literal origins, never patterns. Empty means the product is server-to-server only: no widget
   * session can be minted for it, and its widget routes answer no browser.
   */
  allowedOrigins: string[];
  defaultPriority: Priority;
  defaultType: TicketType;
  /**
   * The Desk identity that stands as the requester on tickets this product raises.
   *
   * An external reporter has no Desk account, and `Ticket.requesterId` is how every screen,
   * report and permission check in the product finds the person who asked. So a product names a
   * support identity in the client organization, and the *real* reporter is carried alongside it
   * on the ticket as an external requester. The screens show the external name; the plumbing
   * keeps working.
   */
  supportRequester: UserRef | null;
  credentials: ProductCredentialSummary[];
  createdAt: string;
}

/** One machine credential. The secret is not here, and never will be. */
export interface ProductCredentialSummary {
  id: string;
  /** Public half of the credential, safe to display and to log. */
  keyId: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  createdBy: UserRef | null;
  createdAt: string;
}

/**
 * The one and only response that carries a secret.
 *
 * Returned by creation and by rotation, and never again: the stored form is a hash, so there is
 * nothing left to show afterwards even to somebody with every permission.
 */
export interface CreatedProductCredential {
  credential: ProductCredentialSummary;
  /** `ask_<keyId>.<secret>` — the complete value to configure in the calling product. */
  secret: string;
}

/** Who reported a problem, when they are not a Desk user. */
export interface ExternalRequesterSummary {
  id: string;
  /** The calling product's own identifier for this person. Opaque to Desk. */
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** What an external product sends to raise a ticket. */
export interface SupportIngressInput {
  title: string;
  description: string;
  type?: TicketType;
  priority?: Priority;
  /** Module or work area, matched against the product's allow-list and used by routing. */
  module?: string;
  source?: TicketSource;
  /** The caller's own ticket or case number, for reconciliation on their side. */
  externalReference?: string;
  externalUserId?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  /** Where in the product this happened — a route, a screen name. */
  context?: string;
  metadata?: Record<string, string>;
  attachments?: SupportIngressAttachment[];
}

export interface SupportIngressAttachment {
  filename: string;
  contentType: string;
  /** Base64. Bounded by the same size limit as an ordinary upload. */
  content: string;
}

/**
 * What the caller gets back.
 *
 * Deliberately thin. It says the ticket exists and gives the caller something to quote back; it
 * says nothing about who it went to, because who works on a ticket is Ashniva's business and not
 * the calling system's.
 */
export interface SupportIngressResult {
  ticketId: string;
  /** `T-123`, for a human to quote. */
  key: string;
  /** Client-visible, like every other status on this wire — see `ExternalTicketStatus.status`. */
  status: ClientVisibleStatus;
  createdAt: string;
  /** True when this request matched an earlier one and no second ticket was made. */
  duplicate: boolean;
}

/**
 * The status an external product may read back about its own ticket.
 *
 * An allow-list rather than a filtered ticket. Internal notes, the routing trail, who is assigned
 * and how available they are do not appear here, and cannot start appearing by somebody widening
 * a query somewhere — the shape simply has no field for them.
 */
export interface ExternalTicketStatus {
  ticketId: string;
  key: string;
  /**
   * The client-visible status, never the internal one.
   *
   * Typed as the union rather than `string` because the difference is not cosmetic: the internal
   * vocabulary says AUTO_ASSIGNED, ACKNOWLEDGED, ESCALATED and REVIEW, and how Ashniva routes and
   * escalates a ticket is Ashniva's business, not the calling product's or its end users'. The
   * portal has always mapped through `toClientVisibleTicketStatus` for exactly this reason; the
   * type is here so a reader that forgets cannot compile.
   */
  status: ClientVisibleStatus;
  priority: string;
  title: string;
  externalReference: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Public replies only. An internal note is never one of these. */
  updates: Array<{ at: string; body: string }>;
}
