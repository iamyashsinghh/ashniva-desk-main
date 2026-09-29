import type { NavigationProp } from '@react-navigation/native';

import { resolveDeepLink } from './deep-links';
import {
  followTarget,
  targetFor,
  targetForPayload,
  targetForWebLink,
  withinTabs,
} from './notification-router';
import type { RootStackParamList } from './param-lists';
import type { TabName } from './tabs';

/**
 * Where a notification tap lands.
 *
 * `deep-links.test.ts` proves an untrusted payload cannot name a screen or carry a bad id. This
 * proves the other half — that a payload which passed opens something that exists for the person
 * holding the phone, and that the app does not stand there having done nothing.
 */

const VALID_ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';
const INTERNAL: readonly TabName[] = ['Home', 'Tasks', 'Tickets', 'Notifications', 'Profile'];
const CLIENT: readonly TabName[] = ['Home', 'Tickets', 'Updates', 'Invoices', 'Profile'];

function fakeNavigation() {
  const navigate = jest.fn();
  // The only test-only cast in this file: the real object carries thirty methods the router never
  // touches, and listing them would assert nothing.
  return { navigate, nav: { navigate } as unknown as NavigationProp<RootStackParamList> };
}

describe('a payload that named a detail screen', () => {
  it('opens it with the id', () => {
    expect(targetFor({ screen: 'TaskDetail', params: { id: VALID_ID } }, INTERNAL)).toEqual({
      kind: 'detail',
      screen: 'TaskDetail',
      id: VALID_ID,
    });
  });

  it('falls back rather than opening a detail screen with no id', () => {
    expect(targetFor({ screen: 'TicketDetail' }, INTERNAL)).toEqual({ kind: 'tab', tab: 'Home' });
  });
});

describe('a payload that named a tab', () => {
  it('opens it when the person has it', () => {
    expect(targetFor({ screen: 'Tasks' }, INTERNAL)).toEqual({ kind: 'tab', tab: 'Tasks' });
  });

  it('lands on the first tab when the person does not', () => {
    // A client has no Tasks tab. Navigating to one that is not in the bar is not a crash — React
    // Navigation logs that nothing handled it — so the tap would appear to do nothing at all.
    expect(targetFor({ screen: 'Tasks' }, CLIENT)).toEqual({ kind: 'tab', tab: 'Home' });
  });

  it('lands somewhere real even with no tabs at all', () => {
    // Only reachable before the session has restored. Profile is the last resort because every
    // role has it — signing out lives there.
    expect(targetFor({ screen: 'Tasks' }, [])).toEqual({ kind: 'tab', tab: 'Profile' });
  });
});

describe('screens that are not tabs', () => {
  it('opens the ones behind Home', () => {
    expect(targetFor({ screen: 'Projects' }, INTERNAL)).toEqual({
      kind: 'plain',
      screen: 'Projects',
    });
    expect(targetFor({ screen: 'QaQueue' }, INTERNAL)).toEqual({
      kind: 'plain',
      screen: 'QaQueue',
    });
  });

  it('opens a conversation and an assignment by id', () => {
    for (const screen of ['Conversation', 'QaAssignment', 'ProjectDetail'] as const) {
      expect(targetFor({ screen, params: { id: VALID_ID } }, INTERNAL)).toEqual({
        kind: 'detail',
        screen,
        id: VALID_ID,
      });
    }
  });
});

describe('the whole path, from an untrusted payload to a navigation call', () => {
  it('routes a tap on a ticket notification to that ticket', () => {
    const { navigate, nav } = fakeNavigation();

    // Exactly what a push service hands the app: an unchecked object.
    followTarget(
      nav,
      targetFor(resolveDeepLink({ screen: 'TicketDetail', id: VALID_ID }), INTERNAL),
    );

    expect(navigate).toHaveBeenCalledWith('TicketDetail', { id: VALID_ID });
  });

  it('routes a tap carrying a screen this app does not have to somewhere real', () => {
    const { navigate, nav } = fakeNavigation();

    followTarget(nav, targetFor(resolveDeepLink({ screen: 'AuditLog', id: VALID_ID }), INTERNAL));

    expect(navigate).toHaveBeenCalledWith('Main', { screen: 'Notifications' });
  });

  it('refuses to pass a malformed id to a route', () => {
    const { navigate, nav } = fakeNavigation();

    followTarget(
      nav,
      targetFor(resolveDeepLink({ screen: 'TaskDetail', id: '../../admin' }), CLIENT),
    );

    // Not the task, and not a route parameter nobody validated: the client's own first tab.
    expect(navigate).toHaveBeenCalledWith('Main', { screen: 'Home' });
  });

  it('navigates to a tab through the tab navigator, not as a stack route', () => {
    const { navigate, nav } = fakeNavigation();
    followTarget(nav, targetFor({ screen: 'Tickets' }, INTERNAL));
    expect(navigate).toHaveBeenCalledWith('Main', { screen: 'Tickets' });
  });
});

describe("a notification's own web link", () => {
  it('translates the routes the phone has', () => {
    expect(targetForWebLink(`/tickets/${VALID_ID}`)).toEqual({
      kind: 'detail',
      screen: 'TicketDetail',
      id: VALID_ID,
    });
    expect(targetForWebLink(`/portal/invoices/${VALID_ID}`)).toEqual({
      kind: 'detail',
      screen: 'InvoiceDetail',
      id: VALID_ID,
    });
    expect(targetForWebLink(`/conversations/${VALID_ID}`)).toEqual({
      kind: 'detail',
      screen: 'Conversation',
      id: VALID_ID,
    });
  });

  it.each([
    [`/invoices/${VALID_ID}`, 'BillingInvoiceDetail'],
    [`/contracts/${VALID_ID}`, 'ContractDetail'],
    [`/portal/contracts/${VALID_ID}`, 'PortalContractDetail'],
    [`/change-requests/${VALID_ID}`, 'ChangeRequestDetail'],
    [`/portal/change-requests/${VALID_ID}`, 'PortalChangeRequestDetail'],
    [`/releases/${VALID_ID}`, 'ReleaseDetail'],
    [`/problems/${VALID_ID}`, 'ProblemDetail'],
    [`/incidents/${VALID_ID}`, 'IncidentDetail'],
  ])('opens %s on %s, the screen for that side', (link, screen) => {
    expect(targetForWebLink(link)).toEqual({ kind: 'detail', screen, id: VALID_ID });
  });

  it('opens the settings an integration alert is about', () => {
    expect(targetForWebLink('/settings/email')).toEqual({ kind: 'plain', screen: 'EmailSettings' });
    expect(targetForWebLink('/settings/whatsapp')).toEqual({
      kind: 'plain',
      screen: 'WhatsAppSettings',
    });
  });

  it('lands both audiences of an approval on the same screen', () => {
    // The API writes `/approvals/<id>` for the provider and `/portal/approvals/<id>` for the
    // client. The screen behind `ApprovalDetail` asks the endpoint for the caller's own side, so
    // one target serves both without the path deciding anything.
    for (const link of [`/approvals/${VALID_ID}`, `/portal/approvals/${VALID_ID}`]) {
      expect(targetForWebLink(link)).toEqual({
        kind: 'detail',
        screen: 'ApprovalDetail',
        id: VALID_ID,
      });
    }
  });

  it('opens the web messenger’s links and the newer list pages', () => {
    expect(targetForWebLink(`/messages/${VALID_ID}`)).toEqual({
      kind: 'detail',
      screen: 'Conversation',
      id: VALID_ID,
    });
    expect(targetForWebLink('/intern-work')).toEqual({ kind: 'plain', screen: 'InternWork' });
    expect(targetForWebLink('/completed-today')).toEqual({
      kind: 'plain',
      screen: 'CompletedToday',
    });
    expect(targetForWebLink('/team/session-logs')).toEqual({
      kind: 'plain',
      screen: 'SessionLogs',
    });
    expect(targetForWebLink('/support-queue')).toEqual({ kind: 'plain', screen: 'SupportQueue' });
  });

  it('returns null for a route that lives only on the desktop', () => {
    // Null rather than Notifications: the person is standing in the notifications list, and
    // "opening" it under them would read as the tap having failed in a different way.
    expect(targetForWebLink('/admin/users')).toBeNull();
    expect(targetForWebLink(`/reports/${VALID_ID}`)).toBeNull();
  });

  it('does not accept a link with something appended to a real one', () => {
    expect(targetForWebLink(`/tickets/${VALID_ID}/../../admin`)).toBeNull();
  });

  it('ignores a query string on a detail link — the id only ever comes from the path', () => {
    expect(targetForWebLink(`/tasks/${VALID_ID}?comment=abc`)).toEqual({
      kind: 'detail',
      screen: 'TaskDetail',
      id: VALID_ID,
    });
    expect(targetForWebLink(`/tasks?id=${VALID_ID}`)).toEqual({ kind: 'tab', tab: 'Tasks' });
  });

  it("opens a project's summary for the summary forms of a project link", () => {
    for (const link of [
      `/projects/${VALID_ID}/summary`,
      `/projects/${VALID_ID}?summary=1`,
      `/projects/${VALID_ID}?tab=summary`,
    ]) {
      expect(targetForWebLink(link)).toEqual({ kind: 'summary', projectId: VALID_ID });
    }
    expect(targetForWebLink(`/projects/${VALID_ID}?tab=tasks`)).toEqual({
      kind: 'detail',
      screen: 'ProjectDetail',
      id: VALID_ID,
    });
  });

  it('opens list pages, dropping a filter the phone cannot express', () => {
    expect(targetForWebLink('/tasks?status=OVERDUE')).toEqual({ kind: 'tab', tab: 'Tasks' });
    expect(targetForWebLink('/portal/tickets')).toEqual({ kind: 'tab', tab: 'Tickets' });
    expect(targetForWebLink('/projects')).toEqual({ kind: 'plain', screen: 'Projects' });
    expect(targetForWebLink('/qa')).toEqual({ kind: 'plain', screen: 'QaQueue' });
  });
});

describe('a tapped push, from its untrusted data block', () => {
  it("follows the notification's link first", () => {
    expect(
      targetForPayload(
        { notificationId: VALID_ID, type: 'TASK_ASSIGNED', link: `/tasks/${VALID_ID}` },
        INTERNAL,
      ),
    ).toEqual({ kind: 'detail', screen: 'TaskDetail', id: VALID_ID });
  });

  it('opens the project summary for a phase-plan alert, whose link is the bare project', () => {
    expect(
      targetForPayload({ type: 'WORK_PLAN_RETURNED', link: `/projects/${VALID_ID}` }, INTERNAL),
    ).toEqual({ kind: 'summary', projectId: VALID_ID });
  });

  it('falls back to an older payload that names a screen', () => {
    expect(targetForPayload({ screen: 'TicketDetail', id: VALID_ID }, INTERNAL)).toEqual({
      kind: 'detail',
      screen: 'TicketDetail',
      id: VALID_ID,
    });
  });

  it('lands on the alerts list for a link the phone does not have, or a hostile one', () => {
    for (const link of ['/admin/users', 'https://evil.example', '//evil.example/tasks']) {
      expect(targetForPayload({ link }, INTERNAL)).toEqual({ kind: 'tab', tab: 'Notifications' });
    }
  });

  it('does not open a tab the person lacks because a link named it', () => {
    // A client has no Tasks tab and no alerts list; their first tab is the somewhere-real answer.
    expect(targetForPayload({ link: '/tasks' }, CLIENT)).toEqual({ kind: 'tab', tab: 'Home' });
    expect(withinTabs({ kind: 'tab', tab: 'Invoices' }, INTERNAL)).toEqual({
      kind: 'tab',
      tab: 'Notifications',
    });
  });

  it('navigates to the summary route with the project id', () => {
    const { navigate, nav } = fakeNavigation();
    followTarget(nav, { kind: 'summary', projectId: VALID_ID });
    expect(navigate).toHaveBeenCalledWith('ProjectSummary', { projectId: VALID_ID });
  });
});
