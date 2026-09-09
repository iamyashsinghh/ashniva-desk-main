import {
  APPROVAL_ACTION,
  APPROVAL_SUBJECT_TYPE,
  type ApprovalActionAvailability,
} from '@ashniva/types';

import { approvalButtons, subjectLine } from './approval-display';

/**
 * Which buttons an approval screen draws, and which it never draws.
 *
 * The boundary is the point of the test. Everything the API offers about *moving* a request is
 * drawn; editing its wording is not, whatever the API says, and neither is the client's own
 * decision — that belongs to the portal screen, which asks for the comment the API requires.
 */

const offered = (
  action: (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION],
  enabled = true,
  reason?: string,
): ApprovalActionAvailability => ({ action, enabled, ...(reason ? { reason } : {}) });

describe('the buttons an approval offers', () => {
  it('draws the transitions the API offered, in a fixed order', () => {
    const buttons = approvalButtons([
      offered(APPROVAL_ACTION.WITHDRAW),
      offered(APPROVAL_ACTION.PUBLISH),
      offered(APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW),
    ]);

    expect(buttons.map((button) => button.action)).toEqual([
      APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW,
      APPROVAL_ACTION.PUBLISH,
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

  it('never draws Edit, whatever the API offers', () => {
    // Editing a five-thousand-character client-visible summary on a phone, with the client's copy
    // of the old wording already in their inbox, is the edit that gets regretted. It stays on the
    // web, the same way a client update's wording does.
    const buttons = approvalButtons([
      offered(APPROVAL_ACTION.EDIT),
      offered(APPROVAL_ACTION.PUBLISH),
    ]);

    expect(buttons.map((button) => button.action)).toEqual([APPROVAL_ACTION.PUBLISH]);
  });

  it('never draws the client’s own decision on the provider’s screen', () => {
    const buttons = approvalButtons([
      offered(APPROVAL_ACTION.APPROVE),
      offered(APPROVAL_ACTION.REQUEST_CHANGES),
      offered(APPROVAL_ACTION.REJECT),
    ]);

    expect(buttons).toEqual([]);
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
