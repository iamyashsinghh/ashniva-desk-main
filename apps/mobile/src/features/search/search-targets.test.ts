import { SEARCH_ENTITY_TYPES, type SearchHit } from '@ashniva/types';

import { iconForType, statusLabel, targetForHit } from './search-targets';

/**
 * Where each result opens. The type is the contract; the web `href` is never parsed, so a web
 * route being reshaped cannot send the phone somewhere else.
 */

function hit(type: string, href = `/${type}s/abc`): SearchHit {
  return {
    type: type as SearchHit['type'],
    id: 'abc',
    reference: null,
    title: 'Something',
    subtitle: null,
    status: null,
    href,
  };
}

describe('for internal staff', () => {
  it.each([
    ['task', 'TaskDetail'],
    ['ticket', 'TicketDetail'],
    ['project', 'ProjectDetail'],
    ['contract', 'ContractDetail'],
    ['invoice', 'BillingInvoiceDetail'],
    ['change-request', 'ChangeRequestDetail'],
    ['problem', 'ProblemDetail'],
    ['incident', 'IncidentDetail'],
    ['approval', 'ApprovalDetail'],
    ['release', 'ReleaseDetail'],
    ['user', 'AdminUserDetail'],
  ])('opens a %s on %s', (type, screen) => {
    expect(targetForHit(hit(type), false)).toEqual({ screen, id: 'abc' });
  });

  it('has a route for every type the API can return', () => {
    for (const type of SEARCH_ENTITY_TYPES) {
      expect(targetForHit(hit(type), false)).not.toBeNull();
    }
  });
});

describe('for a client', () => {
  it('opens their ticket on the shared ticket screen, which reads the portal endpoint', () => {
    expect(targetForHit(hit('ticket', '/portal/tickets/abc'), true)).toEqual({
      screen: 'TicketDetail',
      id: 'abc',
    });
  });

  it('opens their change request on the portal screen, never the internal one', () => {
    expect(targetForHit(hit('change-request', '/portal/change-requests/abc'), true)).toEqual({
      screen: 'PortalChangeRequestDetail',
      id: 'abc',
    });
  });

  it('opens nothing it has no portal screen for', () => {
    expect(targetForHit(hit('project'), true)).toBeNull();
    expect(targetForHit(hit('invoice'), true)).toBeNull();
  });
});

it('leaves a type this app does not know untappable rather than guessing', () => {
  expect(targetForHit(hit('meeting'), false)).toBeNull();
  expect(iconForType('meeting').icon).toBe('search-outline');
});

it('reads a raw status as words', () => {
  expect(statusLabel('IN_PROGRESS')).toBe('In progress');
  expect(statusLabel('WAITING_FOR_CLIENT')).toBe('Waiting for client');
  expect(statusLabel('open')).toBe('Open');
});
