import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  ROLE_KEYS,
  TICKET_ACTION,
  TICKET_STATUS,
  type TicketStatus,
} from '@ashniva/types';

import { assertTicketAction, explainTicketAction, type WorkflowTicket } from './ticket-workflow';

const support = {
  userId: 'sup',
  organizationId: 'provider',
  roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
  isServiceProvider: true,
  permissions: [
    PERMISSIONS.TICKET_TRIAGE,
    PERMISSIONS.TICKET_RESOLVE,
    PERMISSIONS.TICKET_REPLY_PUBLIC,
    PERMISSIONS.COMMENT_INTERNAL,
  ],
};
const developer = {
  userId: 'dev',
  organizationId: 'provider',
  roleKey: ROLE_KEYS.DEVELOPER,
  isServiceProvider: true,
  permissions: [
    PERMISSIONS.TICKET_ACCEPT,
    PERMISSIONS.TICKET_REPLY_PUBLIC,
    PERMISSIONS.COMMENT_INTERNAL,
  ],
};
const clientAdmin = {
  userId: 'ca',
  organizationId: 'acme',
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  isServiceProvider: false,
  permissions: [PERMISSIONS.TICKET_RAISE, PERMISSIONS.TICKET_REPLY_PUBLIC],
};
const otherClient = { ...clientAdmin, userId: 'zc', organizationId: 'zenith' };

function ticket(status: TicketStatus, assignedToId: string | null = 'dev'): WorkflowTicket {
  return { status, assignedToId, requesterId: 'ca', clientOrganizationId: 'acme' };
}

describe('ticket workflow rules', () => {
  it('lets support assign and convert, but not developers', () => {
    expect(
      explainTicketAction(ticket(TICKET_STATUS.NEW, null), support, TICKET_ACTION.ASSIGN).enabled,
    ).toBe(true);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.NEW, null), developer, TICKET_ACTION.ASSIGN).enabled,
    ).toBe(false);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.ASSIGNED), developer, TICKET_ACTION.CONVERT).enabled,
    ).toBe(false);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.CLOSED), support, TICKET_ACTION.CONVERT).reason,
    ).toBe('Closed tickets cannot be converted');
  });

  it('lets the assignee work the ticket and refuses status jumps', () => {
    expect(
      explainTicketAction(ticket(TICKET_STATUS.ASSIGNED), developer, TICKET_ACTION.START).enabled,
    ).toBe(true);
    expect(() =>
      assertTicketAction(ticket(TICKET_STATUS.NEW), developer, TICKET_ACTION.RESOLVE),
    ).toThrow(ConflictException);
    expect(() =>
      assertTicketAction(
        ticket(TICKET_STATUS.IN_PROGRESS, 'other'),
        developer,
        TICKET_ACTION.RESOLVE,
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets the requester organization reply, close and reopen — never another client', () => {
    expect(
      explainTicketAction(
        ticket(TICKET_STATUS.IN_PROGRESS),
        clientAdmin,
        TICKET_ACTION.REPLY_PUBLIC,
      ).enabled,
    ).toBe(true);
    expect(
      explainTicketAction(
        ticket(TICKET_STATUS.IN_PROGRESS),
        otherClient,
        TICKET_ACTION.REPLY_PUBLIC,
      ).enabled,
    ).toBe(false);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.RESOLVED), clientAdmin, TICKET_ACTION.CLOSE).enabled,
    ).toBe(true);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.CLOSED), clientAdmin, TICKET_ACTION.REOPEN).enabled,
    ).toBe(true);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.RESOLVED), otherClient, TICKET_ACTION.CLOSE).enabled,
    ).toBe(false);
    expect(
      explainTicketAction(
        ticket(TICKET_STATUS.IN_PROGRESS),
        clientAdmin,
        TICKET_ACTION.NOTE_INTERNAL,
      ).enabled,
    ).toBe(false);
  });

  it('keeps internal notes for staff with comment:internal', () => {
    expect(
      explainTicketAction(ticket(TICKET_STATUS.IN_PROGRESS), developer, TICKET_ACTION.NOTE_INTERNAL)
        .enabled,
    ).toBe(true);
    expect(
      explainTicketAction(ticket(TICKET_STATUS.IN_PROGRESS), support, TICKET_ACTION.CANCEL).enabled,
    ).toBe(true);
  });
});
