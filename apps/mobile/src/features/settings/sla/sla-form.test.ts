import { draftFrom, draftProblems, toInput } from './sla-form';

describe('the SLA policy draft', () => {
  it('starts a new policy on the web’s defaults, in the device’s timezone', () => {
    const draft = draftFrom(undefined, 'Europe/London');
    expect(draft.scope).toBe('default');
    expect(draft.timezone).toBe('Europe/London');
    expect(draft.businessDays).toEqual([1, 2, 3, 4, 5]);
    expect(draft.rules.CRITICAL).toEqual({ firstResponseHours: '1', resolutionHours: '4' });
  });

  it('asks for the client when the policy is scoped to one', () => {
    const draft = { ...draftFrom(undefined, 'UTC'), name: 'Acme', scope: 'client' as const };
    expect(draftProblems(draft).scope).toBe('Choose the client this policy is for.');
  });

  it('refuses a target of zero hours and a malformed clock', () => {
    const base = draftFrom(undefined, 'UTC');
    const problems = draftProblems({
      ...base,
      name: 'Standard',
      businessHoursEnd: '25:00',
      rules: { ...base.rules, HIGH: { firstResponseHours: '0', resolutionHours: '8' } },
    });
    expect(problems.end).toBeTruthy();
    expect(problems.rules?.HIGH).toBeTruthy();
    expect(problems.rules?.LOW).toBeUndefined();
  });

  it('sends only the scope it names, with days sorted and hours in minutes', () => {
    const input = toInput({
      ...draftFrom(undefined, 'UTC'),
      name: '  Acme  ',
      scope: 'project',
      projectId: 'p1',
      clientOrganizationId: 'c1',
      businessDays: [5, 1, 3],
    });
    expect(input).toMatchObject({
      name: 'Acme',
      isDefault: false,
      projectId: 'p1',
      clientOrganizationId: null,
      businessDays: [1, 3, 5],
    });
    expect(input.rules.find((rule) => rule.priority === 'MEDIUM')).toEqual({
      priority: 'MEDIUM',
      firstResponseMinutes: 240,
      resolutionMinutes: 1440,
    });
  });
});
