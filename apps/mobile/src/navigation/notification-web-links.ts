import type { DetailScreen, NavigationTarget } from './notification-router';

/**
 * The web paths the API writes into a notification's `link`, and the phone screen for each.
 *
 * The provider's and the client's paths are separate entries wherever the phone has a separate
 * screen for each side: `/invoices/<id>` is the provider's billing screen and
 * `/portal/invoices/<id>` the client's, and opening one side's screen for the other side's reader
 * is a screen that fails to load. Tickets and approvals share one screen that asks the API for the
 * caller's own side, so one pattern serves both.
 */
const WEB_LINKS: ReadonlyArray<{ pattern: RegExp; screen: DetailScreen }> = [
  { pattern: /^\/(?:portal\/)?tickets\/([0-9a-f-]{36})$/i, screen: 'TicketDetail' },
  { pattern: /^\/tasks\/([0-9a-f-]{36})$/i, screen: 'TaskDetail' },
  { pattern: /^\/portal\/invoices\/([0-9a-f-]{36})$/i, screen: 'InvoiceDetail' },
  { pattern: /^\/invoices\/([0-9a-f-]{36})$/i, screen: 'BillingInvoiceDetail' },
  { pattern: /^\/projects\/([0-9a-f-]{36})$/i, screen: 'ProjectDetail' },
  { pattern: /^\/(?:conversations|messages)\/([0-9a-f-]{36})$/i, screen: 'Conversation' },
  { pattern: /^\/qa\/assignments\/([0-9a-f-]{36})$/i, screen: 'QaAssignment' },
  { pattern: /^\/(?:portal\/)?approvals\/([0-9a-f-]{36})$/i, screen: 'ApprovalDetail' },
  { pattern: /^\/contracts\/([0-9a-f-]{36})$/i, screen: 'ContractDetail' },
  { pattern: /^\/portal\/contracts\/([0-9a-f-]{36})$/i, screen: 'PortalContractDetail' },
  { pattern: /^\/change-requests\/([0-9a-f-]{36})$/i, screen: 'ChangeRequestDetail' },
  {
    pattern: /^\/portal\/change-requests\/([0-9a-f-]{36})$/i,
    screen: 'PortalChangeRequestDetail',
  },
  { pattern: /^\/releases\/([0-9a-f-]{36})$/i, screen: 'ReleaseDetail' },
  { pattern: /^\/problems\/([0-9a-f-]{36})$/i, screen: 'ProblemDetail' },
  { pattern: /^\/incidents\/([0-9a-f-]{36})$/i, screen: 'IncidentDetail' },
];

/** List pages, reached by links such as `/tasks?status=OVERDUE`; the filter is not carried over. */
const LIST_LINKS: ReadonlyArray<{ pattern: RegExp; target: NavigationTarget }> = [
  { pattern: /^\/tasks\/?$/i, target: { kind: 'tab', tab: 'Tasks' } },
  { pattern: /^\/(?:portal\/)?tickets\/?$/i, target: { kind: 'tab', tab: 'Tickets' } },
  { pattern: /^\/(?:portal\/)?invoices\/?$/i, target: { kind: 'tab', tab: 'Invoices' } },
  { pattern: /^\/notifications\/?$/i, target: { kind: 'tab', tab: 'Notifications' } },
  { pattern: /^\/projects\/?$/i, target: { kind: 'plain', screen: 'Projects' } },
  {
    pattern: /^\/(?:conversations|messages)\/?$/i,
    target: { kind: 'plain', screen: 'Conversations' },
  },
  { pattern: /^\/(?:portal\/)?approvals\/?$/i, target: { kind: 'plain', screen: 'Approvals' } },
  { pattern: /^\/qa\/?$/i, target: { kind: 'plain', screen: 'QaQueue' } },
  { pattern: /^\/intern-work\/?$/i, target: { kind: 'plain', screen: 'InternWork' } },
  { pattern: /^\/completed-today\/?$/i, target: { kind: 'plain', screen: 'CompletedToday' } },
  { pattern: /^\/team\/session-logs\/?$/i, target: { kind: 'plain', screen: 'SessionLogs' } },
  { pattern: /^\/support-queue\/?$/i, target: { kind: 'plain', screen: 'SupportQueue' } },
  // The API's own "the e-mail / WhatsApp connection failed" alerts, for the admins who fix them.
  { pattern: /^\/settings\/email\/?$/i, target: { kind: 'plain', screen: 'EmailSettings' } },
  { pattern: /^\/settings\/whatsapp\/?$/i, target: { kind: 'plain', screen: 'WhatsAppSettings' } },
];

const PROJECT_SUMMARY_PATH = /^\/projects\/([0-9a-f-]{36})\/summary$/i;
const PROJECT_PATH = /^\/projects\/([0-9a-f-]{36})$/i;
const LINK_PARTS = /^([^?#]*)(?:\?([^#]*))?/;

/** `?summary`, `?summary=1` or `?tab=summary` / `?view=summary` on a project link. */
function asksForSummary(query: string): boolean {
  return query.split('&').some((pair) => {
    const [key = '', value = ''] = pair.split('=');
    return key === 'summary' || ((key === 'tab' || key === 'view') && value === 'summary');
  });
}

/**
 * A notification's own link, as a phone target.
 *
 * The API writes one set of links for both apps and not all of them exist here. Returning null
 * for the rest leaves the person where they are rather than opening a blank screen — and
 * `Notifications` would be a worse answer than null, because they are already standing in it.
 * The query string only ever chooses between a project and its summary; ids come from the path.
 */
export function targetForWebLink(link: string): NavigationTarget | null {
  const [, path = '', query = ''] = LINK_PARTS.exec(link) ?? [];

  const summaryId =
    PROJECT_SUMMARY_PATH.exec(path)?.[1] ??
    (asksForSummary(query) ? PROJECT_PATH.exec(path)?.[1] : undefined);
  if (summaryId) {
    return { kind: 'summary', projectId: summaryId };
  }

  for (const { pattern, screen } of WEB_LINKS) {
    const id = pattern.exec(path)?.[1];
    if (id) {
      return { kind: 'detail', screen, id };
    }
  }
  return LIST_LINKS.find(({ pattern }) => pattern.test(path))?.target ?? null;
}
