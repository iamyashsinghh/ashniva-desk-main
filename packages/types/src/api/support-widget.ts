import type { Priority } from '../domain/priority';
import type { TicketSource } from '../domain/ticket-source';
import type { TicketType } from '../domain/ticket-type';

/**
 * What a customer's backend asks for when it opens support for one of its users.
 *
 * The product is not named: it is whichever product the presented machine credential resolves to.
 * A caller that could name its own product could mint a session into somebody else's queue.
 */
export interface WidgetSessionRequest {
  /** The caller's own identifier for the person the widget is being opened for. */
  externalUserId: string;
  /** The exact browser origin the widget will run on. Must be one the product has registered. */
  origin: string;
  name?: string;
  email?: string;
  phone?: string;
}

/** The token, and everything the widget needs in order to render itself correctly. */
export interface WidgetSessionGrant {
  /** `askp_<claims>.<signature>` — safe to hand to a browser, and only for a few minutes. */
  token: string;
  expiresAt: string;
  capabilities: WidgetCapabilities;
}

/**
 * What this product's support actually offers, resolved from the registry and the tier policy.
 *
 * The widget renders from this rather than from anything it was configured with, so turning a
 * capability off in Desk turns the control off in every embedded copy without a redeploy. Each
 * `unavailableReason` is a sentence meant to be shown: a disabled control that cannot say why is
 * only slightly better than one that lies.
 */
export interface WidgetCapabilities {
  productCode: string;
  productName: string;
  /** False when support is closed for this product; `unavailableReason` says so in words. */
  canRaiseTicket: boolean;
  /** Whether the widget may offer "Call support" to this requester. */
  canRequestCall: boolean;
  unavailableReason: string | null;
  callUnavailableReason: string | null;
  /** Sources the product may declare. Empty means the widget should not offer a choice. */
  allowedSources: TicketSource[];
  /** Work areas its tickets may name. Empty means any. */
  allowedWorkAreas: string[];
  defaultPriority: Priority;
  defaultType: TicketType;
  /** Whether an attachment may be sent at all. */
  attachmentsEnabled: boolean;
}
