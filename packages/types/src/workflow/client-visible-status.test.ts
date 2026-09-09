import {
  CLIENT_VISIBLE_STATUS,
  CLIENT_VISIBLE_STATUS_LABELS,
  toClientVisibleTaskStatus,
  toClientVisibleTicketStatus,
} from './client-visible-status';
import { TASK_STATUS, type TaskStatus } from './task-status';
import { TICKET_STATUS, type TicketStatus } from './ticket-status';

describe('client-visible status mapping', () => {
  it('maps every task status to a client-visible status', () => {
    for (const status of Object.values(TASK_STATUS) as TaskStatus[]) {
      expect(Object.values(CLIENT_VISIBLE_STATUS)).toContain(toClientVisibleTaskStatus(status));
    }
  });

  it('maps every ticket status to a client-visible status', () => {
    for (const status of Object.values(TICKET_STATUS) as TicketStatus[]) {
      expect(Object.values(CLIENT_VISIBLE_STATUS)).toContain(toClientVisibleTicketStatus(status));
    }
  });

  it('never exposes failure states to clients', () => {
    const failureStates: TaskStatus[] = [
      TASK_STATUS.QA_FAILED,
      TASK_STATUS.RETURNED_TO_DEV,
      TASK_STATUS.LIVE_FAILED,
      TASK_STATUS.ROLLBACK_REQUIRED,
    ];
    for (const status of failureStates) {
      expect(toClientVisibleTaskStatus(status)).toBe(CLIENT_VISIBLE_STATUS.IN_DEVELOPMENT);
    }
  });

  it('shows client UAT as awaiting approval', () => {
    expect(toClientVisibleTaskStatus(TASK_STATUS.CLIENT_UAT)).toBe(
      CLIENT_VISIBLE_STATUS.AWAITING_YOUR_APPROVAL,
    );
  });

  it('shows resolved and closed tickets as completed', () => {
    expect(toClientVisibleTicketStatus(TICKET_STATUS.RESOLVED)).toBe(
      CLIENT_VISIBLE_STATUS.COMPLETED,
    );
    expect(toClientVisibleTicketStatus(TICKET_STATUS.CLOSED)).toBe(CLIENT_VISIBLE_STATUS.COMPLETED);
  });

  /**
   * Cancelled work was not delivered, and telling a client it was is a lie they act on: a ticket
   * cancelled as a duplicate reading "Completed" means the client stops chasing something nobody
   * is doing.
   */
  it('does not tell a client that cancelled work was completed', () => {
    expect(toClientVisibleTicketStatus(TICKET_STATUS.CANCELLED)).toBe(CLIENT_VISIBLE_STATUS.CLOSED);
    expect(toClientVisibleTaskStatus(TASK_STATUS.CANCELLED)).toBe(CLIENT_VISIBLE_STATUS.CLOSED);

    for (const status of [TICKET_STATUS.CANCELLED, TASK_STATUS.CANCELLED]) {
      const visible =
        status === TICKET_STATUS.CANCELLED
          ? toClientVisibleTicketStatus(TICKET_STATUS.CANCELLED)
          : toClientVisibleTaskStatus(TASK_STATUS.CANCELLED);
      expect(visible).not.toBe(CLIENT_VISIBLE_STATUS.COMPLETED);
      expect(CLIENT_VISIBLE_STATUS_LABELS[visible].toLowerCase()).not.toContain('completed');
    }
  });
});
