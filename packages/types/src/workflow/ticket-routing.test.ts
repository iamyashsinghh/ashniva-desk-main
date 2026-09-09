import {
  ROUTING_OUTCOME,
  ROUTING_POLICY_VERSION,
  ROUTING_ROLE,
  ROUTING_SKIP_REASON,
  planRouting,
  type RoutingCandidateInput,
  type RoutingContext,
} from './ticket-routing';

/**
 * The routing decision, which is the whole of package 8b's judgement.
 *
 * Every branch is exercised here rather than through the API, because the API can only show that
 * *a* decision was reached — these tests are what say it was the right one, and why.
 */

const REQUESTER = 'user-requester';

function candidate(over: Partial<RoutingCandidateInput> = {}): RoutingCandidateInput {
  return {
    userId: 'user-a',
    role: ROUTING_ROLE.PRIMARY_DEVELOPER,
    isProjectMember: true,
    isActive: true,
    workAreas: ['API'],
    available: true,
    unavailableReason: null,
    ...over,
  };
}

function context(over: Partial<RoutingContext> = {}): RoutingContext {
  return {
    workArea: null,
    requesterId: REQUESTER,
    autoRouteEnabled: true,
    isDirectType: true,
    ...over,
  };
}

describe('planRouting — the happy path', () => {
  it('gives the ticket to the first eligible person in the chain', () => {
    const plan = planRouting([candidate({ userId: 'user-a' })], context());
    expect(plan).toMatchObject({
      outcome: ROUTING_OUTCOME.AUTO_ASSIGNED,
      assignedUserId: 'user-a',
      queueReason: null,
      policyVersion: ROUTING_POLICY_VERSION,
    });
  });

  it('stops at the first acceptance rather than considering the rest', () => {
    const plan = planRouting(
      [
        candidate({ userId: 'user-a', role: ROUTING_ROLE.MODULE_OWNER }),
        candidate({ userId: 'user-b' }),
      ],
      context(),
    );
    expect(plan.assignedUserId).toBe('user-a');
    // The trail records what was considered, not everybody who exists.
    expect(plan.trail).toHaveLength(1);
    expect(plan.trail[0]).toMatchObject({ accepted: true, role: ROUTING_ROLE.MODULE_OWNER });
  });

  it('prefers the module owner over the primary developer', () => {
    const plan = planRouting(
      [
        candidate({ userId: 'backend-dev', role: ROUTING_ROLE.MODULE_OWNER, workAreas: ['API'] }),
        candidate({ userId: 'anyone', role: ROUTING_ROLE.PRIMARY_DEVELOPER }),
      ],
      context({ workArea: 'API' }),
    );
    expect(plan.assignedUserId).toBe('backend-dev');
  });
});

describe('planRouting — work-area matching', () => {
  const chain = (owner: string[]) => [
    candidate({ userId: 'frontend-dev', role: ROUTING_ROLE.MODULE_OWNER, workAreas: owner }),
    candidate({ userId: 'primary-dev', role: ROUTING_ROLE.PRIMARY_DEVELOPER, workAreas: [] }),
  ];

  it('skips a module owner who does not cover the ticket’s area', () => {
    const plan = planRouting(chain(['Frontend']), context({ workArea: 'API' }));
    expect(plan.trail[0]).toMatchObject({
      userId: 'frontend-dev',
      skipReason: ROUTING_SKIP_REASON.WORK_AREA_MISMATCH,
    });
    // And falls through rather than failing: the fallback exists for exactly this.
    expect(plan.assignedUserId).toBe('primary-dev');
  });

  it('does not apply the work-area test to the rest of the chain', () => {
    // The primary developer holds no work areas at all and is still eligible — the chain below
    // the module owner is the fallback *for* the case where nobody owns the area.
    const plan = planRouting(chain(['Frontend']), context({ workArea: 'API' }));
    expect(plan.trail[1]).toMatchObject({ userId: 'primary-dev', accepted: true });
  });

  it('does not require a work area when the ticket names none', () => {
    const plan = planRouting(chain(['Frontend']), context({ workArea: null }));
    expect(plan.assignedUserId).toBe('frontend-dev');
  });
});

describe('planRouting — eligibility', () => {
  const only = (over: Partial<RoutingCandidateInput>) =>
    planRouting([candidate(over)], context()).trail[0];

  it('records leave, hours and workload with the router’s own words', () => {
    expect(only({ available: false, unavailableReason: 'ON_LEAVE' })).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.ON_LEAVE,
    });
    expect(only({ available: false, unavailableReason: 'OUT_OF_HOURS' })).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.OUT_OF_HOURS,
    });
    expect(only({ available: false, unavailableReason: 'AT_WORKLOAD_LIMIT' })).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.AT_WORKLOAD_LIMIT,
    });
  });

  it('skips somebody who has left the project', () => {
    expect(only({ isProjectMember: false })).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.NOT_PROJECT_MEMBER,
    });
  });

  it('skips a deactivated account', () => {
    expect(only({ isActive: false })).toMatchObject({ skipReason: ROUTING_SKIP_REASON.INACTIVE });
  });

  it('does not route a ticket back to the person who raised it', () => {
    expect(only({ userId: REQUESTER })).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.IS_REQUESTER,
    });
  });

  it('reports the first thing that disqualified somebody, not the last', () => {
    // Left the project *and* on leave: the useful answer is that they are not on the project.
    expect(
      only({ isProjectMember: false, available: false, unavailableReason: 'ON_LEAVE' }),
    ).toMatchObject({ skipReason: ROUTING_SKIP_REASON.NOT_PROJECT_MEMBER });
  });

  it('names a role nobody is configured for rather than passing over it silently', () => {
    const plan = planRouting(
      [candidate({ userId: '', role: ROUTING_ROLE.MODULE_OWNER }), candidate({ userId: 'user-b' })],
      context(),
    );
    expect(plan.trail[0]).toMatchObject({
      userId: null,
      skipReason: ROUTING_SKIP_REASON.NOT_CONFIGURED,
    });
    expect(plan.assignedUserId).toBe('user-b');
  });

  it('counts one person once even when they hold two roles', () => {
    const plan = planRouting(
      [
        candidate({
          userId: 'user-a',
          role: ROUTING_ROLE.PRIMARY_DEVELOPER,
          available: false,
          unavailableReason: 'ON_LEAVE',
        }),
        candidate({ userId: 'user-a', role: ROUTING_ROLE.BACKUP_DEVELOPER }),
      ],
      context(),
    );
    expect(plan.trail[1]).toMatchObject({ skipReason: ROUTING_SKIP_REASON.ALREADY_CONSIDERED });
    expect(plan.outcome).toBe(ROUTING_OUTCOME.SUPPORT_QUEUE);
  });

  it('does not offer the same ticket to somebody it already went to', () => {
    const plan = planRouting(
      [candidate({ userId: 'user-a' })],
      context({ previouslyAssigned: ['user-a'] }),
    );
    expect(plan.trail[0]).toMatchObject({
      skipReason: ROUTING_SKIP_REASON.PREVIOUSLY_ASSIGNED,
    });
  });
});

describe('planRouting — when nobody can take it', () => {
  it('falls to the support queue with a reason rather than dropping the ticket', () => {
    const plan = planRouting(
      [
        candidate({ userId: 'user-a', available: false, unavailableReason: 'ON_LEAVE' }),
        candidate({ userId: 'user-b', available: false, unavailableReason: 'OUT_OF_HOURS' }),
      ],
      context(),
    );
    expect(plan).toMatchObject({
      outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
      assignedUserId: null,
      queueReason: 'Every candidate in the chain was unavailable',
    });
    // Both refusals are on the record, which is what makes the outcome explainable.
    expect(plan.trail).toHaveLength(2);
  });

  it('says so plainly when the project configured nobody at all', () => {
    const plan = planRouting([], context());
    expect(plan.queueReason).toBe('This project has no support ownership configured');
  });

  it('respects a project that switched automatic routing off', () => {
    const plan = planRouting([candidate()], context({ autoRouteEnabled: false }));
    expect(plan).toMatchObject({ outcome: ROUTING_OUTCOME.DISABLED, assignedUserId: null });
    // Nobody was considered, so nobody's availability was recorded either.
    expect(plan.trail).toEqual([]);
  });

  it('sends a non-direct type to the support queue without walking the chain', () => {
    const plan = planRouting([candidate()], context({ isDirectType: false }));
    expect(plan.outcome).toBe(ROUTING_OUTCOME.SUPPORT_QUEUE);
    expect(plan.trail).toEqual([]);
  });
});
