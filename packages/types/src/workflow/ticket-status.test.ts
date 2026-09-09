import {
  ALL_TICKET_STATUSES,
  PHASE1_TICKET_STATUSES,
  TICKET_STATUS,
  TICKET_STATUS_LABELS,
  TICKET_TRANSITIONS,
  canTransitionTicket,
  isTicketClosed,
} from './ticket-status';

describe('ticket workflow definition', () => {
  it('has a label and a transition entry for every status', () => {
    for (const status of ALL_TICKET_STATUSES) {
      expect(TICKET_STATUS_LABELS[status]).toBeTruthy();
      expect(Array.isArray(TICKET_TRANSITIONS[status])).toBe(true);
    }
  });

  it('only transitions into statuses that exist', () => {
    for (const status of ALL_TICKET_STATUSES) {
      for (const target of TICKET_TRANSITIONS[status]) {
        expect(PHASE1_TICKET_STATUSES).toContain(target);
      }
    }
  });

  it('leaves no status unreachable except the one every ticket starts in', () => {
    // A status nothing transitions into is a status no ticket ever reaches — which is what the
    // three routing statuses were until package 8b, and what this guards against repeating.
    const reachable = new Set(ALL_TICKET_STATUSES.flatMap((status) => TICKET_TRANSITIONS[status]));
    const unreachable = ALL_TICKET_STATUSES.filter(
      (status) => status !== TICKET_STATUS.NEW && !reachable.has(status),
    );
    expect(unreachable).toEqual([]);
  });

  it('leaves no status a dead end except the two that end a ticket', () => {
    const deadEnds = ALL_TICKET_STATUSES.filter(
      (status) => TICKET_TRANSITIONS[status].length === 0,
    );
    // Cancelled is final. Closed still reopens, so it is not one.
    expect(deadEnds).toEqual([TICKET_STATUS.CANCELLED]);
  });

  it('routes New → Auto-assigned → Acknowledged → In progress', () => {
    const path = [
      TICKET_STATUS.NEW,
      TICKET_STATUS.AUTO_ASSIGNED,
      TICKET_STATUS.ACKNOWLEDGED,
      TICKET_STATUS.IN_PROGRESS,
    ];
    path.forEach((status, index) => {
      const next = path[index + 1];
      if (next) {
        expect({ status, next, allowed: canTransitionTicket(status, next) }).toEqual({
          status,
          next,
          allowed: true,
        });
      }
    });
  });

  it('lets an unacknowledged ticket escalate or be re-routed, and an escalated one come back', () => {
    expect(canTransitionTicket(TICKET_STATUS.AUTO_ASSIGNED, TICKET_STATUS.ESCALATED)).toBe(true);
    // Re-routing to the next candidate leaves the ticket auto-assigned to somebody else.
    expect(canTransitionTicket(TICKET_STATUS.AUTO_ASSIGNED, TICKET_STATUS.AUTO_ASSIGNED)).toBe(
      true,
    );
    // A manager assigning by hand takes it off the automatic path.
    expect(canTransitionTicket(TICKET_STATUS.AUTO_ASSIGNED, TICKET_STATUS.ASSIGNED)).toBe(true);
    expect(canTransitionTicket(TICKET_STATUS.ESCALATED, TICKET_STATUS.IN_PROGRESS)).toBe(true);
  });

  it('does not let routing skip the work', () => {
    expect(canTransitionTicket(TICKET_STATUS.AUTO_ASSIGNED, TICKET_STATUS.RESOLVED)).toBe(false);
    expect(canTransitionTicket(TICKET_STATUS.NEW, TICKET_STATUS.ACKNOWLEDGED)).toBe(false);
    expect(canTransitionTicket(TICKET_STATUS.NEW, TICKET_STATUS.ESCALATED)).toBe(false);
  });

  it('lets a forced re-route put a hand-assigned ticket back on the automatic path', () => {
    // `FORCE_ROUTABLE` in the router admits both, and the router leaves a routed ticket
    // AUTO_ASSIGNED. Without these edges the one thing `force` exists for was a write that went
    // round this table.
    expect(canTransitionTicket(TICKET_STATUS.ASSIGNED, TICKET_STATUS.AUTO_ASSIGNED)).toBe(true);
    expect(canTransitionTicket(TICKET_STATUS.ACKNOWLEDGED, TICKET_STATUS.AUTO_ASSIGNED)).toBe(true);
  });

  /**
   * The escalation timer reaches tickets in both of these, and it still must not overwrite what
   * they say. "Waiting for client" is what the desk and the client are both reading; replacing it
   * with "Escalated" would hide the fact that the ball is not ours. The escalation is recorded on
   * the activity trail instead — see `RoutingEscalationService.escalate`.
   */
  it('does not let an escalation overwrite what a ticket is waiting for', () => {
    expect(canTransitionTicket(TICKET_STATUS.WAITING_CLIENT, TICKET_STATUS.ESCALATED)).toBe(false);
    expect(canTransitionTicket(TICKET_STATUS.REVIEW, TICKET_STATUS.ESCALATED)).toBe(false);
    // …while the states an escalation is genuinely about stay open to it.
    expect(canTransitionTicket(TICKET_STATUS.ASSIGNED, TICKET_STATUS.ESCALATED)).toBe(true);
    expect(canTransitionTicket(TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.ESCALATED)).toBe(true);
  });

  it('lets the assignee of an escalated ticket acknowledge it', () => {
    // The edge existed from the start; the guard in `TicketRoutingService.acknowledge` did not
    // admit ESCALATED, so an escalated ticket could be acknowledged on the routing state and
    // still read to everyone else as nobody's problem.
    expect(canTransitionTicket(TICKET_STATUS.ESCALATED, TICKET_STATUS.ACKNOWLEDGED)).toBe(true);
  });

  it('follows New → Assigned → In progress → Waiting → Review → Resolved → Closed', () => {
    const path = [
      TICKET_STATUS.NEW,
      TICKET_STATUS.ASSIGNED,
      TICKET_STATUS.IN_PROGRESS,
      TICKET_STATUS.WAITING_CLIENT,
      TICKET_STATUS.IN_PROGRESS,
      TICKET_STATUS.REVIEW,
      TICKET_STATUS.RESOLVED,
      TICKET_STATUS.CLOSED,
    ];
    path.forEach((status, index) => {
      const next = path[index + 1];
      if (next) {
        expect(canTransitionTicket(status, next)).toBe(true);
      }
    });
  });

  it('allows reopening resolved and closed tickets only', () => {
    expect(canTransitionTicket(TICKET_STATUS.RESOLVED, TICKET_STATUS.REOPENED)).toBe(true);
    expect(canTransitionTicket(TICKET_STATUS.CLOSED, TICKET_STATUS.REOPENED)).toBe(true);
    expect(canTransitionTicket(TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.REOPENED)).toBe(false);
    expect(canTransitionTicket(TICKET_STATUS.NEW, TICKET_STATUS.RESOLVED)).toBe(false);
  });

  it('treats resolved, closed and cancelled as closed', () => {
    expect(isTicketClosed(TICKET_STATUS.RESOLVED)).toBe(true);
    expect(isTicketClosed(TICKET_STATUS.CLOSED)).toBe(true);
    expect(isTicketClosed(TICKET_STATUS.CANCELLED)).toBe(true);
    expect(isTicketClosed(TICKET_STATUS.WAITING_CLIENT)).toBe(false);
  });
});
