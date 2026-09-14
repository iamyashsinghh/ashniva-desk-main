import {
  WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
  WORK_PLAN_PENALTY_PERCENT,
  isWorkPlanOverdue,
  parseWorkPlanFromText,
  remainingSeconds,
  scoreAfterPenalty,
  workPlanFromModelJson,
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

describe('work-plan timing', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('counts down until the due instant, then reports overdue', () => {
    const due = new Date('2026-09-14T12:00:10.000Z');
    expect(remainingSeconds(due, now, null)).toBe(10);
    expect(isWorkPlanOverdue(due, now, null)).toBe(false);
    expect(isWorkPlanOverdue(due, new Date('2026-09-14T12:00:10.000Z'), null)).toBe(true);
    expect(isWorkPlanOverdue(due, new Date('2026-09-14T12:01:00.000Z'), now)).toBe(false);
  });

  it('steps the on-time percentage down per missed point and never below zero', () => {
    expect(scoreAfterPenalty(100)).toBe(100 - WORK_PLAN_PENALTY_PERCENT);
    expect(scoreAfterPenalty(3, 2)).toBe(0);
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
