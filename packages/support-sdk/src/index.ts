/**
 * `@ashniva/support-sdk` — the embedded support surface for any product that raises tickets into
 * Ashniva Desk.
 *
 * Three layers, and a host may stop at whichever one it wants:
 *
 *  * `SupportClient` — authenticate, identify, submit, check status, ask about calls. No UI.
 *  * `SupportWidget` — the state machine on top of it, including the unavailable and offline
 *    states that are easy to forget and matter most when something is wrong.
 *  * `mountSupportWidget` (vanilla) and `useSupportWidget` (React) — two reference integrations
 *    over the same machine, so they cannot drift.
 *
 * Nothing here knows about Carelix, Irista or any other Ashniva product. It knows about a base
 * URL, a way to obtain a session, and the shapes in `contract.ts`.
 *
 * The interface is versioned: `SDK_INTERFACE_VERSION`, also exposed as `AshnivaSupport.version` in
 * the browser build, so a page can tell which contract the copy it loaded speaks.
 */
export { SDK_INTERFACE_VERSION, LIMITS, SUPPORT_EVENTS } from './contract';
export type {
  IssueInput,
  SupportAttachment,
  SupportCapabilities,
  SupportEvent,
  SupportSession,
  TicketKind,
  TicketPriority,
  TicketReference,
  TicketStatus,
} from './contract';

export { SupportClient } from './client';
export type { SessionProvider, SupportClientOptions } from './client';

export { SupportWidget } from './widget';
export type { WidgetListener, WidgetState } from './widget';

export { mountSupportWidget } from './vanilla';
export type { MountOptions, MountedWidget } from './vanilla';

export { attachmentFromCanvas, attachmentFromFile } from './attachments';

export { SupportRequestError, fetchTransport } from './transport';
export type { SupportRequest, SupportResponse, SupportTransport } from './transport';

export { SupportValidationError, decodedByteLength, validateIssue } from './validation';
