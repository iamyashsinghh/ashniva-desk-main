/**
 * The shapes the SDK exchanges with Desk, and the version of that agreement.
 *
 * **Why these are inlined rather than imported from `@ashniva/types`.** That package is
 * `private: true` and unpublished, is compiled against `lib: ["ES2022"]` with `types: ["node"]`,
 * and carries `zod` as a runtime dependency. A customer installing `@ashniva/support-sdk` from a
 * registry could not resolve it, and a `<script>` tag build would pull a validation library into
 * a page that has no use for one. So the handful of constants and shapes the SDK actually needs
 * live here, in a file that depends on nothing.
 *
 * The obvious risk of a second copy is drift, so it is closed rather than accepted:
 * `contract.test.ts` imports `@ashniva/types` as a *dev* dependency and asserts that every bound
 * and every event key below still equals the server's. The test never ships; the guarantee does.
 */

/**
 * The version of the SDK's public interface.
 *
 * Bumped when a method is removed, a parameter changes meaning, or a bound the server enforces
 * moves — not when something is added. A host application reads `AshnivaSupport.version` to decide
 * whether the copy it loaded understands the calls it is about to make, which matters because a
 * `<script>` tag build is upgraded by whoever controls the page and not by whoever wrote it.
 */
export const SDK_INTERFACE_VERSION = 1;

/** Bounds mirrored from `products/dto/support-ingress.dto.ts`. Checked before a request is made. */
export const LIMITS = {
  titleMin: 3,
  titleMax: 200,
  descriptionMin: 3,
  descriptionMax: 10_000,
  contextMax: 300,
  externalReferenceMax: 120,
  attachmentsMax: 5,
  /** Decoded bytes. Base64 inflates by a third, and the server checks the decoded size. */
  attachmentBytesMax: 10 * 1024 * 1024,
  filenameMax: 200,
  contentTypeMax: 120,
  metadataKeys: 20,
  metadataKeyMax: 60,
  metadataValueMax: 500,
} as const;

/** Events a callback receiver is told about. Here so the SDK's docs and the server agree. */
export const SUPPORT_EVENTS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.waiting_client',
  'ticket.in_progress',
  'ticket.resolved',
  'ticket.closed',
  'support.update',
] as const;

export type SupportEvent = (typeof SUPPORT_EVENTS)[number];

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TicketKind = 'BUG' | 'SUPPORT' | 'FEATURE_REQUEST' | 'INCIDENT' | 'QUESTION' | 'OTHER';

/** What the widget may tell Desk about a problem. */
export interface IssueInput {
  subject: string;
  description: string;
  /** The product's own module or work area, where it configures a list. */
  category?: string;
  /** Where in the product this happened — a route, a screen name. */
  context?: string;
  priority?: TicketPriority;
  type?: TicketKind;
  /** The caller's own case number, echoed back on every status read. */
  externalReference?: string;
  metadata?: Record<string, string>;
  attachments?: SupportAttachment[];
}

export interface SupportAttachment {
  filename: string;
  contentType: string;
  /** Base64, without a data-URL prefix. `attachmentFromFile` produces this shape. */
  content: string;
}

/** What comes back when a ticket is accepted. */
export interface TicketReference {
  ticketId: string;
  /** `T-123`, for a person to quote. */
  key: string;
  /** One of Desk's client-visible statuses (Received, Assigned, …), never an internal one. */
  status: string;
  createdAt: string;
  /** True when this request matched an earlier one and no second ticket was made. */
  duplicate: boolean;
}

/** The client-safe status of one ticket. Mirrors the server's `ExternalTicketStatus` exactly. */
export interface TicketStatus {
  ticketId: string;
  key: string;
  /** One of Desk's client-visible statuses (Received, Assigned, …), never an internal one. */
  status: string;
  priority: string;
  title: string;
  externalReference: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Public replies only. An internal note is never one of these. */
  updates: Array<{ at: string; body: string }>;
}

/** What this product's support currently offers, resolved server-side on every read. */
export interface SupportCapabilities {
  productCode: string;
  productName: string;
  canRaiseTicket: boolean;
  canRequestCall: boolean;
  /** A sentence meant to be shown next to a disabled control. */
  unavailableReason: string | null;
  callUnavailableReason: string | null;
  allowedSources: string[];
  allowedWorkAreas: string[];
  defaultPriority: TicketPriority;
  defaultType: TicketKind;
  attachmentsEnabled: boolean;
}

/** The token the host application's backend minted, and when it stops working. */
export interface SupportSession {
  token: string;
  expiresAt: string;
  capabilities?: SupportCapabilities;
}
