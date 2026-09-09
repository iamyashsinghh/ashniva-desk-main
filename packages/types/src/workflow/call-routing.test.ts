import {
  CALL_ROUTING_STEP,
  planCallTarget,
  type CallAssigneeInput,
  type CallTargetInput,
} from './call-routing';
import {
  ROUTING_OUTCOME,
  ROUTING_POLICY_VERSION,
  ROUTING_ROLE,
  ROUTING_SKIP_REASON,
  type RoutingPlan,
} from './ticket-routing';

/**
 * Where a support call goes.
 *
 * The point of these tests is the ladder: assigned owner, then routing's answer, then escalation,
 * then the configured fallback, then a person. Every rung is exercised, and so is the case that
 * matters most — running out of rungs, which must produce a support-queue decision with a reason
 * rather than silence.
 */

function assignee(over: Partial<CallAssigneeInput> = {}): CallAssigneeInput {
  return {
    userId: 'user-owner',
    available: true,
    unavailableReason: null,
    isActive: true,
    ...over,
  };
}

function plan(over: Partial<RoutingPlan> = {}): RoutingPlan {
  return {
    outcome: ROUTING_OUTCOME.AUTO_ASSIGNED,
    assignedUserId: 'user-chain',
    trail: [
      {
        position: 1,
        userId: 'user-chain',
        role: ROUTING_ROLE.PRIMARY_DEVELOPER,
        accepted: true,
        skipReason: null,
        detail: 'Primary developer',
      },
    ],
    policyVersion: ROUTING_POLICY_VERSION,
    queueReason: null,
    ...over,
  };
}

function input(over: Partial<CallTargetInput> = {}): CallTargetInput {
  return {
    assignee: assignee(),
    plan: plan(),
    escalation: null,
    fallbackUserId: null,
    fallbackEligible: false,
    alreadyTried: [],
    attemptsUsed: 0,
    maxAttempts: 3,
    ...over,
  };
}

describe('planCallTarget', () => {
  it('rings the person the ticket is already assigned to first', () => {
    const decision = planCallTarget(input());

    expect(decision.step).toBe(CALL_ROUTING_STEP.ASSIGNED_OWNER);
    expect(decision.userId).toBe('user-owner');
  });

  it('skips the assigned owner when availability says they are not there', () => {
    const decision = planCallTarget(
      input({ assignee: assignee({ available: false, unavailableReason: 'ON_LEAVE' }) }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.ROUTING_CHAIN);
    expect(decision.userId).toBe('user-chain');
    expect(decision.reason).toContain('on leave');
  });

  it('skips an assigned owner who has left the project or the tenant', () => {
    const decision = planCallTarget(input({ assignee: assignee({ isActive: false }) }));

    expect(decision.step).toBe(CALL_ROUTING_STEP.ROUTING_CHAIN);
    expect(decision.userId).toBe('user-chain');
  });

  it('names the chain position the routing engine accepted', () => {
    const decision = planCallTarget(input({ assignee: null }));

    expect(decision.role).toBe(ROUTING_ROLE.PRIMARY_DEVELOPER);
  });

  it('never rings the same destination twice on one call', () => {
    const decision = planCallTarget(
      input({ alreadyTried: ['user-owner', 'user-chain'], attemptsUsed: 2, escalation: null }),
    );

    expect(decision.userId).not.toBe('user-owner');
    expect(decision.userId).not.toBe('user-chain');
  });

  it('escalates when the routing chain has nobody left', () => {
    const decision = planCallTarget(
      input({
        assignee: null,
        plan: plan({
          outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
          assignedUserId: null,
          queueReason: 'No eligible developer',
          trail: [
            {
              position: 1,
              userId: 'user-chain',
              role: ROUTING_ROLE.PRIMARY_DEVELOPER,
              accepted: false,
              skipReason: ROUTING_SKIP_REASON.OUT_OF_HOURS,
              detail: 'Outside their working hours',
            },
          ],
        }),
        escalation: plan({ assignedUserId: 'user-senior' }),
      }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.ESCALATION);
    expect(decision.userId).toBe('user-senior');
  });

  it('falls back to the configured destination when routing and escalation are both empty', () => {
    const decision = planCallTarget(
      input({
        assignee: null,
        plan: plan({ outcome: ROUTING_OUTCOME.SUPPORT_QUEUE, assignedUserId: null }),
        escalation: plan({ outcome: ROUTING_OUTCOME.SUPPORT_QUEUE, assignedUserId: null }),
        fallbackUserId: 'user-fallback',
        fallbackEligible: true,
      }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.POLICY_FALLBACK);
    expect(decision.userId).toBe('user-fallback');
  });

  it('ignores a configured fallback who could not take the call anyway', () => {
    const decision = planCallTarget(
      input({
        assignee: null,
        plan: plan({ outcome: ROUTING_OUTCOME.SUPPORT_QUEUE, assignedUserId: null }),
        fallbackUserId: 'user-fallback',
        fallbackEligible: false,
      }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.SUPPORT_QUEUE);
    expect(decision.userId).toBeNull();
  });

  it('ends in the support queue with a stated reason rather than in silence', () => {
    const decision = planCallTarget(
      input({
        assignee: null,
        plan: plan({
          outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
          assignedUserId: null,
          queueReason: 'Everyone is outside their working hours',
        }),
      }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.SUPPORT_QUEUE);
    expect(decision.userId).toBeNull();
    expect(decision.reason).toContain('outside their working hours');
  });

  it('stops once the attempt ceiling is reached, whoever is still eligible', () => {
    const decision = planCallTarget(input({ attemptsUsed: 3, maxAttempts: 3 }));

    expect(decision.step).toBe(CALL_ROUTING_STEP.SUPPORT_QUEUE);
    expect(decision.userId).toBeNull();
    expect(decision.reason).toContain('3 destinations');
  });

  it('respects routing being switched off for the project', () => {
    const decision = planCallTarget(
      input({
        assignee: null,
        plan: plan({
          outcome: ROUTING_OUTCOME.DISABLED,
          assignedUserId: null,
          queueReason: 'Automatic routing is switched off for this project',
        }),
      }),
    );

    expect(decision.step).toBe(CALL_ROUTING_STEP.SUPPORT_QUEUE);
    expect(decision.reason).toContain('switched off');
  });

  it('treats a ticket with no project as having no chain to walk', () => {
    const decision = planCallTarget(input({ assignee: null, plan: null }));

    expect(decision.step).toBe(CALL_ROUTING_STEP.SUPPORT_QUEUE);
    expect(decision.userId).toBeNull();
  });
});
