import { PERMISSIONS, type AiSummaryStatus, type PermissionKey } from '@ashniva/types';

import {
  AI_SUMMARY_ACTIONS,
  canStartGeneration,
  checkAiSummaryAction,
  isRegenerable,
  isSummaryEditable,
} from './ai-summary-workflow';

const WRITER: PermissionKey[] = [PERMISSIONS.AI_SUMMARY_GENERATE];
const APPROVER: PermissionKey[] = [PERMISSIONS.AI_SUMMARY_APPROVE];
const PUBLISHER: PermissionKey[] = [
  PERMISSIONS.AI_SUMMARY_APPROVE,
  PERMISSIONS.CLIENT_UPDATE_PUBLISH,
];

describe('checkAiSummaryAction — the happy path', () => {
  it('submits a draft for review', () => {
    expect(checkAiSummaryAction('submit', 'DRAFT', 'DEVELOPER_DAILY', WRITER)).toEqual({
      ok: true,
      to: 'IN_REVIEW',
    });
  });

  it('approves a summary in review', () => {
    expect(checkAiSummaryAction('approve', 'IN_REVIEW', 'CLIENT_WEEKLY', APPROVER)).toEqual({
      ok: true,
      to: 'APPROVED',
    });
  });

  it('publishes an approved client summary', () => {
    expect(checkAiSummaryAction('publish', 'APPROVED', 'CLIENT_WEEKLY', PUBLISHER)).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
  });

  it('sends work back with a reason', () => {
    expect(
      checkAiSummaryAction('requestChanges', 'IN_REVIEW', 'CLIENT_WEEKLY', APPROVER, 'Too vague'),
    ).toEqual({ ok: true, to: 'CHANGES_REQUESTED' });
  });
});

describe('checkAiSummaryAction — state', () => {
  it('refuses to approve a draft that nobody reviewed', () => {
    // The guard on the route says this person may approve; this says not this summary, not yet.
    expect(checkAiSummaryAction('approve', 'DRAFT', 'CLIENT_WEEKLY', APPROVER)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it('refuses to publish something that was never approved', () => {
    expect(checkAiSummaryAction('publish', 'IN_REVIEW', 'CLIENT_WEEKLY', PUBLISHER)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it('refuses everything on a published summary', () => {
    for (const action of ['submit', 'approve', 'publish', 'cancel'] as const) {
      expect(checkAiSummaryAction(action, 'PUBLISHED', 'CLIENT_WEEKLY', PUBLISHER)).toMatchObject({
        ok: false,
      });
    }
  });

  it('lets a failed generation be cancelled or returned to draft', () => {
    expect(
      checkAiSummaryAction('cancel', 'GENERATION_FAILED', 'CLIENT_WEEKLY', APPROVER, 'Give up'),
    ).toMatchObject({ ok: true });
    expect(
      checkAiSummaryAction('returnToDraft', 'GENERATION_FAILED', 'CLIENT_WEEKLY', WRITER),
    ).toMatchObject({ ok: true });
  });
});

describe('checkAiSummaryAction — permissions', () => {
  it('refuses approval to someone who may only generate', () => {
    expect(checkAiSummaryAction('approve', 'IN_REVIEW', 'CLIENT_WEEKLY', WRITER)).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('refuses publication to an approver who cannot publish to clients', () => {
    // Being trusted with generated text is not the same as being trusted to send it to a client.
    const check = checkAiSummaryAction('publish', 'APPROVED', 'CLIENT_WEEKLY', APPROVER);
    expect(check).toMatchObject({ ok: false, reason: 'permission' });
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.CLIENT_UPDATE_PUBLISH);
  });

  it('refuses publication to a publisher who cannot approve summaries', () => {
    const check = checkAiSummaryAction('publish', 'APPROVED', 'CLIENT_WEEKLY', [
      PERMISSIONS.CLIENT_UPDATE_PUBLISH,
    ]);
    expect(check).toMatchObject({ ok: false, reason: 'permission' });
  });

  it('names every missing permission, not just the first', () => {
    const check = checkAiSummaryAction('publish', 'APPROVED', 'CLIENT_WEEKLY', []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.AI_SUMMARY_APPROVE);
    expect(check.message).toContain(PERMISSIONS.CLIENT_UPDATE_PUBLISH);
  });
});

describe('checkAiSummaryAction — internal summary types', () => {
  it('refuses to publish a developer daily, whatever permissions are held', () => {
    // Not "a client summary that happens to be unpublished" — publishing it is not an action
    // this type has at all.
    const check = checkAiSummaryAction('publish', 'APPROVED', 'DEVELOPER_DAILY', PUBLISHER);
    expect(check).toMatchObject({ ok: false, reason: 'not-client-facing' });
  });

  it('refuses to publish a lead daily and a ticket resolution too', () => {
    for (const type of ['LEAD_DAILY', 'TICKET_RESOLUTION'] as const) {
      expect(checkAiSummaryAction('publish', 'APPROVED', type, PUBLISHER)).toMatchObject({
        ok: false,
        reason: 'not-client-facing',
      });
    }
  });

  it('allows publication for each client-facing type', () => {
    for (const type of ['CLIENT_WEEKLY', 'PROJECT_PROGRESS', 'RELEASE_NOTE_DRAFT'] as const) {
      expect(checkAiSummaryAction('publish', 'APPROVED', type, PUBLISHER)).toMatchObject({
        ok: true,
      });
    }
  });
});

describe('checkAiSummaryAction — reasons', () => {
  it('requires a reason to send work back', () => {
    expect(
      checkAiSummaryAction('requestChanges', 'IN_REVIEW', 'CLIENT_WEEKLY', APPROVER),
    ).toMatchObject({ ok: false, reason: 'note' });
  });

  it('does not accept whitespace as a reason', () => {
    expect(checkAiSummaryAction('cancel', 'DRAFT', 'CLIENT_WEEKLY', APPROVER, '   ')).toMatchObject(
      { ok: false, reason: 'note' },
    );
  });
});

describe('the action table and the transition table agree', () => {
  it('every action targets a state its sources can transition to', () => {
    // If the two ever disagree the check fails closed, but a disagreement is still a bug.
    for (const [action, rule] of Object.entries(AI_SUMMARY_ACTIONS)) {
      for (const from of rule.from) {
        const check = checkAiSummaryAction(
          action as keyof typeof AI_SUMMARY_ACTIONS,
          from,
          'CLIENT_WEEKLY',
          [...WRITER, ...PUBLISHER],
          'a reason',
        );
        expect(check).toMatchObject({ ok: true, to: rule.to });
      }
    }
  });
});

describe('editability', () => {
  const editable: AiSummaryStatus[] = ['DRAFT', 'CHANGES_REQUESTED', 'GENERATION_FAILED'];
  const frozen: AiSummaryStatus[] = [
    'GENERATING',
    'IN_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'CANCELLED',
  ];

  it.each(editable)('%s is editable', (status) => {
    expect(isSummaryEditable(status)).toBe(true);
    expect(isRegenerable(status)).toBe(true);
  });

  it.each(frozen)('%s is not', (status) => {
    expect(isSummaryEditable(status)).toBe(false);
  });

  it('refuses to start a run on something already generating', () => {
    expect(canStartGeneration('GENERATING')).toBe(false);
    expect(canStartGeneration('DRAFT')).toBe(true);
  });

  it('refuses to regenerate over an approval', () => {
    expect(isRegenerable('APPROVED')).toBe(false);
    expect(isRegenerable('PUBLISHED')).toBe(false);
  });
});

describe('a summary a worker owns', () => {
  const generatePermissions = [
    PERMISSIONS.AI_SUMMARY_GENERATE,
    PERMISSIONS.AI_SUMMARY_APPROVE,
    PERMISSIONS.CLIENT_UPDATE_PUBLISH,
  ];

  it('cannot be returned to draft while it is GENERATING', () => {
    // An earlier revision allowed this to rescue a summary whose worker had died. It also let a
    // second generation be claimed on top of a live one — two workers replacing each other's
    // sources, and a hand-edit made in between silently overwritten. GENERATING stays terminal
    // until a run carries a claim token the final write is conditional on.
    const result = checkAiSummaryAction(
      'returnToDraft',
      'GENERATING',
      'LEAD_DAILY',
      generatePermissions,
    );
    expect(result).toMatchObject({ ok: false, reason: 'state' });
  });

  it('cannot be cancelled while it is GENERATING either', () => {
    const result = checkAiSummaryAction(
      'cancel',
      'GENERATING',
      'LEAD_DAILY',
      generatePermissions,
      'no longer needed',
    );
    expect(result).toMatchObject({ ok: false, reason: 'state' });
  });

  it('can be returned to draft once generation has failed', () => {
    expect(
      checkAiSummaryAction('returnToDraft', 'GENERATION_FAILED', 'LEAD_DAILY', generatePermissions),
    ).toMatchObject({ ok: true });
  });
});
