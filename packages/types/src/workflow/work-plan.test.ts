import {
  WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
  WORK_PLAN_PENALTY_PERCENT,
  WORK_PLAN_POINT_STATUS,
  isWorkPlanOverdue,
  nestWorkPlanNotes,
  dueAtFromRemaining,
  effectiveWorkPlanAssigneeId,
  effectiveWorkPlanPriority,
  parseWorkPlanFromText,
  remainingSeconds,
  extraSeconds,
  extraThisRunSeconds,
  elapsedSeconds,
  workPlanFromFreeText,
  workPlanAdditionsFromModelJson,
  workPlanFromModelJson,
  matchWorkPlanAdditionPhase,
  scoreAfterPenalty,
  shouldRestrictWorkPlanToAssignee,
  workPlanPhasesVisibleToDeveloper,
  workPlanPointActions,
  effectiveWorkPlanAssignedAt,
} from './work-plan';

describe('parseWorkPlanFromText', () => {
  it('splits a PDF-like outline into phases, titles and timed points', () => {
    const phases = parseWorkPlanFromText(`
PHASE 1 DISCOVERY
Title 1 Kickoff
- Gather requirements 30m
- Map stakeholders 1h
Title 2 Research
- Review the current app
PHASE 2 BUILD
Title 1 API
- Auth endpoints 2h
    `);

    expect(phases).toHaveLength(2);
    expect(phases[0]?.heading).toMatch(/discovery/i);
    expect(phases[0]?.titles[0]?.points[0]).toEqual({
      body: 'Gather requirements',
      estimateMinutes: 30,
    });
    expect(phases[0]?.titles[0]?.points[1]?.estimateMinutes).toBe(60);
    expect(phases[1]?.titles[0]?.points[0]?.estimateMinutes).toBe(120);
  });

  it('uses the default estimate when a bullet has no time', () => {
    const [phase] = parseWorkPlanFromText('- Write the login screen');
    expect(phase?.titles[0]?.points[0]?.estimateMinutes).toBe(WORK_PLAN_DEFAULT_ESTIMATE_MINUTES);
  });
});

describe('workPlanFromFreeText', () => {
  it('keeps a structured outline when the prompt already has phases', () => {
    const [phase] = workPlanFromFreeText('PHASE 1 AUTH\nTitle 1 Login\n- OTP screen 45m');
    expect(phase?.heading).toMatch(/auth/i);
    expect(phase?.titles[0]?.points[0]?.estimateMinutes).toBe(45);
  });

  it('wraps a sentence as one topic with the default time', () => {
    const [phase] = workPlanFromFreeText('Add OTP login and a forgot-password email');
    expect(phase?.titles[0]?.points[0]?.body).toMatch(/OTP login/i);
    expect(phase?.titles[0]?.points[0]?.estimateMinutes).toBe(WORK_PLAN_DEFAULT_ESTIMATE_MINUTES);
  });
});

describe('work-plan timing', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('counts down until the due instant, then reports overdue', () => {
    const due = new Date('2026-09-14T12:00:10.000Z');
    expect(remainingSeconds(due, now, null)).toBe(10);
    expect(isWorkPlanOverdue(due, now, null)).toBe(false);
    expect(isWorkPlanOverdue(due, new Date('2026-09-14T12:00:10.000Z'), null)).toBe(true);
    expect(isWorkPlanOverdue(due, new Date('2026-09-14T12:01:00.000Z'), now)).toBe(false);
  });

  it('holds leftover seconds while the timer is paused with the tester', () => {
    const due = new Date('2026-09-14T12:00:10.000Z');
    expect(remainingSeconds(due, now, null, 42)).toBe(42);
    expect(isWorkPlanOverdue(due, now, null, 42)).toBe(false);
    expect(isWorkPlanOverdue(due, now, null, 0)).toBe(true);
    expect(remainingSeconds(due, now, now, 42)).toBe(0);
    expect(dueAtFromRemaining(now, 10).toISOString()).toBe('2026-09-14T12:00:10.000Z');
  });

  it('steps the on-time percentage down per missed point and never below zero', () => {
    expect(scoreAfterPenalty(100)).toBe(100 - WORK_PLAN_PENALTY_PERCENT);
    expect(scoreAfterPenalty(3, 2)).toBe(0);
  });

  it('counts extra time past the estimate until the point is done', () => {
    const due = new Date('2026-09-14T11:59:50.000Z');
    expect(extraThisRunSeconds(due, now, 10)).toBe(0);
    expect(extraThisRunSeconds(due, now, 0)).toBe(10);
    expect(extraThisRunSeconds(due, now, 0, 0)).toBe(0);
    expect(extraSeconds(0, due, now, null, null)).toBe(10);
    expect(extraSeconds(30, due, now, null, 0)).toBe(30);
    expect(extraSeconds(30, due, now, now, null)).toBe(30);
    expect(elapsedSeconds(due, now)).toBe(10);
    const sentAt = new Date('2026-09-14T12:00:20.000Z');
    expect(extraSeconds(0, due, now, null, 0, sentAt)).toBe(30);
    expect(extraSeconds(12, due, now, null, 0, sentAt)).toBe(12);
  });
});

describe('workPlanFromModelJson', () => {
  it('reads a fenced JSON plan into phases, titles and timed points', () => {
    const phases = workPlanFromModelJson(`
\`\`\`json
{"phases":[{"heading":"Discovery","titles":[{"title":"Kickoff","points":[{"body":"Gather requirements","estimateMinutes":45}]}]}]}
\`\`\`
    `);
    expect(phases).toEqual([
      {
        heading: 'Discovery',
        titles: [
          {
            title: 'Kickoff',
            points: [{ body: 'Gather requirements', estimateMinutes: 45 }],
          },
        ],
      },
    ]);
  });

  it('drops empty rows and clamps minutes', () => {
    const [phase] = workPlanFromModelJson({
      phases: [
        {
          heading: 'Build',
          titles: [
            {
              title: 'API',
              points: [
                { body: 'Auth', estimateMinutes: 0 },
                { body: '   ' },
                { body: 'Users', estimateMinutes: 99999 },
              ],
            },
          ],
        },
      ],
    });
    expect(phase?.titles[0]?.points).toEqual([
      { body: 'Auth', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES },
      { body: 'Users', estimateMinutes: 24 * 60 },
    ]);
  });
});

describe('workPlanAdditionsFromModelJson', () => {
  it('attaches new titles to an existing phase id', () => {
    const [addition] = workPlanAdditionsFromModelJson({
      additions: [
        {
          phaseId: '01a0a982-8e70-77f8-8871-f8bb69f78a91',
          heading: 'Auth',
          titles: [{ title: 'OTP', points: [{ body: 'OTP screen', estimateMinutes: 45 }] }],
        },
      ],
    });
    expect(addition?.phaseId).toBe('01a0a982-8e70-77f8-8871-f8bb69f78a91');
    expect(addition?.titles[0]?.title).toBe('OTP');
  });

  it('treats a phases payload as new phases', () => {
    const [addition] = workPlanAdditionsFromModelJson({
      phases: [
        { heading: 'Payments', titles: [{ title: 'UPI', points: [{ body: 'Collect UPI' }] }] },
      ],
    });
    expect(addition?.phaseId).toBeNull();
    expect(addition?.heading).toBe('Payments');
  });
});

describe('matchWorkPlanAdditionPhase', () => {
  const phases = [
    { id: '01a0a982-8e70-77f8-8871-f8bb69f78a91', heading: 'Auth' },
    { id: '01a0a982-8e70-77f8-8871-f8bb69f78a92', heading: 'Billing' },
  ];

  it('prefers the phase id, then the heading', () => {
    expect(
      matchWorkPlanAdditionPhase({ phaseId: phases[0]!.id, heading: 'Billing', titles: [] }, phases)
        ?.heading,
    ).toBe('Auth');
    expect(
      matchWorkPlanAdditionPhase({ phaseId: null, heading: 'billing', titles: [] }, phases)
        ?.heading,
    ).toBe('Billing');
    expect(
      matchWorkPlanAdditionPhase(
        { phaseId: '00000000-0000-4000-8000-000000000000', heading: 'Auth', titles: [] },
        phases,
      )?.heading,
    ).toBe('Auth');
    expect(
      matchWorkPlanAdditionPhase({ phaseId: null, heading: 'Payments', titles: [] }, phases),
    ).toBeUndefined();
  });
});

describe('effectiveWorkPlanAssignedAt', () => {
  it('uses the title stamp, then phase, then the whole plan', () => {
    const titleAt = new Date('2026-09-18T10:00:00.000Z');
    const phaseAt = new Date('2026-09-18T09:00:00.000Z');
    const planAt = new Date('2026-09-18T08:00:00.000Z');
    expect(
      effectiveWorkPlanAssignedAt(
        { assignedToId: 'dev-1', assignedAt: titleAt },
        { assignedToId: 'dev-2', assignedAt: phaseAt },
        { assignedToId: 'dev-3', assignedAt: planAt },
      ),
    ).toBe(titleAt);
    expect(
      effectiveWorkPlanAssignedAt(
        { assignedToId: null, assignedAt: titleAt },
        { assignedToId: 'dev-2', assignedAt: phaseAt },
        { assignedToId: 'dev-3', assignedAt: planAt },
      ),
    ).toBe(phaseAt);
  });
});

describe('workPlanPointActions', () => {
  const base = {
    startedById: 'dev-1',
    actorId: 'dev-1',
    canWork: true,
    canTest: false,
    canLead: false,
  };

  it('lets a developer start only work assigned to them', () => {
    expect(workPlanPointActions({ ...base, status: WORK_PLAN_POINT_STATUS.PENDING }).canStart).toBe(
      false,
    );
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.PENDING,
      }).canStart,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
      }).canSubmitTest,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
      }).canPass,
    ).toBe(false);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.RETURNED,
      }).canStart,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.RETURNED,
        hasOpenErrorChild: true,
      }).canStart,
    ).toBe(false);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.PENDING,
        isError: true,
      }).canStart,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
        isError: true,
      }).canSubmitTest,
    ).toBe(false);
  });

  it('hides developer Start from a tester, and waits for Send to tester', () => {
    const tester = { ...base, actorId: 'qa-1', canWork: true, canTest: true };
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.PENDING }).canStart,
    ).toBe(false);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.AWAITING_TEST })
        .canStartTest,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.AWAITING_TEST }).canPass,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.TESTING }).canPass,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.TESTING }).canFail,
    ).toBe(true);
  });

  it('lets a tester mark Good or Error as soon as the developer sends the point', () => {
    const tester = { ...base, actorId: 'qa-1', canWork: false, canTest: true };
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.AWAITING_TEST }).canPass,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.AWAITING_TEST }).canFail,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.TESTING }).canPass,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.TESTING }).canFail,
    ).toBe(true);
    expect(
      workPlanPointActions({ ...tester, status: WORK_PLAN_POINT_STATUS.IN_PROGRESS }).canPass,
    ).toBe(false);
  });

  it('lets developer and tester reply on a note even after the point is done', () => {
    expect(
      workPlanPointActions({ ...base, status: WORK_PLAN_POINT_STATUS.COMPLETED }).canReply,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        actorId: 'qa-1',
        canWork: false,
        canTest: true,
        status: WORK_PLAN_POINT_STATUS.AWAITING_TEST,
      }).canReply,
    ).toBe(true);
  });

  it('hides Start from a developer when the point is assigned to somebody else', () => {
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-2',
        status: WORK_PLAN_POINT_STATUS.PENDING,
      }).canStart,
    ).toBe(false);
    expect(
      workPlanPointActions({
        ...base,
        assignedToId: 'dev-1',
        status: WORK_PLAN_POINT_STATUS.PENDING,
      }).canStart,
    ).toBe(true);
    expect(
      workPlanPointActions({
        ...base,
        actorId: 'lead-1',
        canLead: true,
        assignedToId: 'dev-2',
        status: WORK_PLAN_POINT_STATUS.PENDING,
      }).canStart,
    ).toBe(true);
  });
});

describe('effectiveWorkPlanAssigneeId', () => {
  it('lets a title override a phase, and a phase override the plan', () => {
    expect(effectiveWorkPlanAssigneeId('title', 'phase', 'plan')).toBe('title');
    expect(effectiveWorkPlanAssigneeId(null, 'phase', 'plan')).toBe('phase');
    expect(effectiveWorkPlanAssigneeId(null, null, 'plan')).toBe('plan');
    expect(effectiveWorkPlanAssigneeId(null, null, null)).toBeNull();
  });
});

describe('effectiveWorkPlanPriority', () => {
  it('lets a title override a phase, and a phase override the plan', () => {
    expect(effectiveWorkPlanPriority('CRITICAL', 'HIGH', 'LOW')).toBe('CRITICAL');
    expect(effectiveWorkPlanPriority(null, 'HIGH', 'LOW')).toBe('HIGH');
    expect(effectiveWorkPlanPriority(null, null, 'LOW')).toBe('LOW');
    expect(effectiveWorkPlanPriority(null, null, null)).toBe('MEDIUM');
  });
});

describe('shouldRestrictWorkPlanToAssignee', () => {
  it('restricts developers, not managers, leads or testers', () => {
    expect(shouldRestrictWorkPlanToAssignee({ canAssign: false, canTest: false })).toBe(true);
    expect(shouldRestrictWorkPlanToAssignee({ canAssign: true, canTest: false })).toBe(false);
    expect(shouldRestrictWorkPlanToAssignee({ canAssign: false, canTest: true })).toBe(false);
  });
});

describe('workPlanPhasesVisibleToDeveloper', () => {
  it('keeps only titles whose effective assignee is that developer', () => {
    const phases = [
      {
        heading: 'A',
        titles: [
          { title: 'Mine', effectiveAssignedTo: { id: 'dev-1' } },
          { title: 'Theirs', effectiveAssignedTo: { id: 'dev-2' } },
        ],
      },
      {
        heading: 'B',
        titles: [{ title: 'Nobody', effectiveAssignedTo: null }],
      },
    ];
    expect(workPlanPhasesVisibleToDeveloper(phases, 'dev-1')).toEqual([
      {
        heading: 'A',
        titles: [{ title: 'Mine', effectiveAssignedTo: { id: 'dev-1' } }],
      },
    ]);
    expect(workPlanPhasesVisibleToDeveloper(phases, 'dev-3')).toEqual([]);
  });
});

describe('nestWorkPlanNotes', () => {
  it('puts replies under the root note, including replies to a reply', () => {
    const nested = nestWorkPlanNotes([
      { id: 'root', parentId: null, body: 'Login fails' },
      { id: 'r1', parentId: 'root', body: 'Which browser?' },
      { id: 'r2', parentId: 'r1', body: 'Chrome 128' },
    ]);
    expect(nested).toHaveLength(1);
    expect(nested[0]?.replies.map((note) => note.body)).toEqual(['Which browser?', 'Chrome 128']);
  });
});
