import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_SUBJECT_TYPE,
  type ApprovalActionAvailability,
  type PortalApprovalSummary,
} from '@ashniva/types';

import {
  approvalButtons,
  byLine,
  isDirectTransition,
  splitPortalApprovals,
  subjectLine,
} from './approval-display';

/**
 * Which buttons an approval screen draws, and which it never draws.
 *
 * The boundary is the point of the test. Everything the API offers the provider is drawn —
 * moving a request, rewording it, withdrawing it. The client's own decision is not, whatever the
 * API says: that belongs to the portal screen, which asks for the comment the API requires.
 */

const offered = (
  action: (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION],
  enabled = true,
  reason?: string,
): ApprovalActionAvailability => ({ action, enabled, ...(reason ? { reason } : {}) });

describe('the buttons an approval offers', () => {
  it('draws the actions the API offered, in a fixed order', () => {
    const buttons = approvalButtons([
      offered(APPROVAL_ACTION.WITHDRAW),
      offered(APPROVAL_ACTION.EDIT),
      offered(APPROVAL_ACTION.PUBLISH),
      offered(APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW),
    ]);

    expect(buttons.map((button) => button.action)).toEqual([
      APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW,
      APPROVAL_ACTION.PUBLISH,
      APPROVAL_ACTION.EDIT,
      APPROVAL_ACTION.WITHDRAW,
    ]);
  });

  it('draws nothing for an action the API did not mention', () => {
    expect(approvalButtons([offered(APPROVAL_ACTION.PUBLISH)])).toHaveLength(1);
  });

  it('keeps a refused action, disabled, with the API’s own reason', () => {
    const [button] = approvalButtons([
      offered(APPROVAL_ACTION.PUBLISH, false, 'Somebody else has to review this first'),
    ]);

    expect(button?.enabled).toBe(false);
    expect(button?.reason).toBe('Somebody else has to review this first');
  });

  it('never draws the client’s own decision on the provider’s screen', () => {
    const buttons = approvalButtons([
      offered(APPROVAL_ACTION.APPROVE),
      offered(APPROVAL_ACTION.REQUEST_CHANGES),
      offered(APPROVAL_ACTION.REJECT),
    ]);

    expect(buttons).toEqual([]);
  });

  it('sends only the three state changes straight to the API; edit and withdraw ask first', () => {
    expect(isDirectTransition(APPROVAL_ACTION.PUBLISH)).toBe(true);
    expect(isDirectTransition(APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW)).toBe(true);
    expect(isDirectTransition(APPROVAL_ACTION.RETURN_TO_DRAFT)).toBe(true);
    expect(isDirectTransition(APPROVAL_ACTION.EDIT)).toBe(false);
    expect(isDirectTransition(APPROVAL_ACTION.WITHDRAW)).toBe(false);
  });
});

describe('the subject line', () => {
  it('names the kind of thing as well as the thing', () => {
    expect(
      subjectLine({
        type: APPROVAL_SUBJECT_TYPE.MILESTONE,
        id: 'm1',
        label: 'Phase 2 handover',
        link: null,
      }),
    ).toBe('Milestone / deliverable · Phase 2 handover');
  });
});

describe('who did it', () => {
  it('is a dash when nobody has', () => {
    expect(byLine(null, null)).toBe('—');
  });

  it('is the name alone when there is no date', () => {
    expect(byLine({ name: 'Priya Rao' }, null)).toBe('Priya Rao');
  });

  it('is the name and when, otherwise', () => {
    expect(byLine({ name: 'Priya Rao' }, '2026-09-03T09:00:00.000Z')).toMatch(/^Priya Rao · /);
  });
});

describe('the client’s two halves', () => {
  const row = (id: string, status: PortalApprovalSummary['status']): PortalApprovalSummary => ({
    id,
    title: id,
    status,
    subject: { type: APPROVAL_SUBJECT_TYPE.MILESTONE, id: 'm1', label: 'Phase 2', link: null },
    project: null,
    publishedAt: null,
    dueDate: null,
    decidedBy: null,
    decidedAt: null,
    isOverdue: false,
  });

  it('puts published requests in "waiting" and everything else in "decided"', () => {
    const split = splitPortalApprovals([
      row('a', APPROVAL_STATUS.PUBLISHED),
      row('b', APPROVAL_STATUS.CLIENT_APPROVED),
      row('c', APPROVAL_STATUS.CHANGES_REQUESTED),
      row('d', APPROVAL_STATUS.PUBLISHED),
    ]);

    expect(split.waiting.map((entry) => entry.id)).toEqual(['a', 'd']);
    expect(split.decided.map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});
