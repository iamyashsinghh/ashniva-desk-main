import {
  ROLE_KEYS,
  type PermissionKey,
  type ProjectSupportConfig,
  type UnassignedTicketSummary,
} from '@ashniva/types';
import type { RenderResult } from '@testing-library/react-native';

import { jsonResponse, sessionUser } from '../../shared/testing/harness';

/**
 * Fixtures and fetch helpers shared by the support-queue screen tests. Imported only by tests.
 *
 * Each test file still mocks `../auth/auth-api` itself — `jest.mock` is hoisted per file — and
 * `signIn` reaches that mock through `jest.requireMock`.
 */

export const ASHA = { id: 'u1', name: 'Asha Rao', email: 'asha@example.com' };

export const TICKET: UnassignedTicketSummary = {
  id: 't1',
  key: 'SUP-7',
  title: 'Invoices will not download',
  priority: 'HIGH',
  status: 'NEW',
  project: { id: 'p1', code: 'ASH' },
  module: 'Billing',
  clientOrganizationName: 'Acme',
  createdAt: '2026-09-28T04:00:00.000Z',
  queueReason: 'Everybody on the chain is on leave',
};

export const CONFIG: ProjectSupportConfig = {
  ownership: {
    projectId: 'p1',
    primaryDeveloper: ASHA,
    backupDeveloper: null,
    senior: null,
    tester: null,
    supportExecutive: null,
    moduleOwners: { Billing: 'u1' },
    workloadLimit: null,
    ackMinutes: 30,
    escalationMinutes: 60,
    directTypes: [],
    autoRouteEnabled: true,
    fallbackUser: null,
    updatedAt: '2026-09-28T04:00:00.000Z',
  },
  onCall: [],
  team: [
    {
      userId: 'u1',
      user: ASHA,
      status: 'ON_LEAVE',
      source: 'HR',
      until: null,
      note: null,
      updatedAt: '2026-09-28T04:00:00.000Z',
      effectiveStatus: 'ON_LEAVE',
      withinSchedule: true,
      schedule: null,
    },
  ],
};

export function signIn(permissions: PermissionKey[]) {
  const { restoreSession } = jest.requireMock('../auth/auth-api') as {
    restoreSession: jest.Mock;
  };
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.TEAM_LEAD, permissions }),
  });
}

/** Answers every read the screen makes; `routing` is what `GET /tickets/:id/routing` returns. */
export function respond(
  fetchMock: jest.Mock,
  queue: UnassignedTicketSummary[] = [TICKET],
  routing: unknown = { state: null, trail: [] },
) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/tickets/queue/unassigned')) {
      return jsonResponse(queue);
    }
    if (path.includes('/support-config')) {
      return jsonResponse(CONFIG);
    }
    if (path.includes('/projects')) {
      return jsonResponse([{ id: 'p1', code: 'ASH', name: 'Ashniva' }]);
    }
    return jsonResponse(routing);
  });
}

/** The method and parsed body of the request whose path ends with `pathEnd`. */
export function sent(
  fetchMock: jest.Mock,
  pathEnd: string,
): { method: unknown; body: unknown } | undefined {
  const call = fetchMock.mock.calls.find((entry) => String(entry[0]).endsWith(pathEnd));
  if (!call) {
    return undefined;
  }
  const init = call[1] as RequestInit;
  return { method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

/** The sheet's button: the list behind a sheet can carry a button with the same label. */
export function lastButton(view: RenderResult, name: string) {
  const buttons = view.getAllByRole('button', { name });
  const last = buttons[buttons.length - 1];
  if (!last) {
    throw new Error(`No ${name} button`);
  }
  return last;
}
