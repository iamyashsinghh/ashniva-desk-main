import { TICKET_ACTION, TICKET_STATUS, type TicketHistoryEntry } from '@ashniva/types';

import { describeHistory } from '../ticket-display';
import { offeredActions, primaryActions } from './ticket-actions';

describe('offeredActions', () => {
  it('lists allowed and meaningfully refused actions in the web order', () => {
    const offered = offeredActions([
      { action: TICKET_ACTION.RESOLVE, enabled: true },
      {
        action: TICKET_ACTION.CLOSE,
        enabled: false,
        reason: 'Only a resolved ticket can be closed',
      },
      { action: TICKET_ACTION.ASSIGN, enabled: true },
      { action: TICKET_ACTION.REOPEN, enabled: false, reason: 'Not available while in progress' },
      { action: TICKET_ACTION.REPLY_PUBLIC, enabled: true },
    ]);
    expect(offered.map((entry) => entry.action)).toEqual([
      TICKET_ACTION.ASSIGN,
      TICKET_ACTION.RESOLVE,
      TICKET_ACTION.CLOSE,
    ]);
    expect(offered[2]).toMatchObject({
      enabled: false,
      reason: 'Only a resolved ticket can be closed',
    });
  });
});

describe('primaryActions', () => {
  it('puts moving the work forward first, and never a refused action', () => {
    const offered = offeredActions([
      { action: TICKET_ACTION.ASSIGN, enabled: true },
      { action: TICKET_ACTION.START, enabled: false, reason: 'Assign it first' },
      { action: TICKET_ACTION.RESOLVE, enabled: true },
      { action: TICKET_ACTION.CANCEL, enabled: true },
    ]);
    expect(primaryActions(offered).map((entry) => entry.action)).toEqual([
      TICKET_ACTION.RESOLVE,
      TICKET_ACTION.ASSIGN,
    ]);
  });
});

describe('describeHistory', () => {
  const entry = (overrides: Partial<TicketHistoryEntry>): TicketHistoryEntry => ({
    id: 'h1',
    fromStatus: null,
    toStatus: TICKET_STATUS.NEW,
    changedBy: { id: 'u1', name: 'Asha', email: 'asha@example.com' },
    note: null,
    createdAt: '2026-09-28T10:00:00.000Z',
    ...overrides,
  });

  it('words the first entry as raising the ticket', () => {
    expect(describeHistory(entry({}))).toBe('raised the ticket');
  });

  it('words a same-status entry as an update and a change as a move', () => {
    expect(
      describeHistory(entry({ fromStatus: TICKET_STATUS.NEW, toStatus: TICKET_STATUS.NEW })),
    ).toBe('updated it');
    expect(
      describeHistory(
        entry({ fromStatus: TICKET_STATUS.NEW, toStatus: TICKET_STATUS.IN_PROGRESS }),
      ),
    ).toMatch(/^moved it from .+ to .+$/);
  });
});
