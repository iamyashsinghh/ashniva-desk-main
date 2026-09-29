import { summaryActions, type SummaryPermissions } from './summary-display';

const everything: SummaryPermissions = {
  canGenerate: true,
  canApprove: true,
  canPublishToClients: true,
};

const withText = { internalContent: 'Internal', clientContent: 'Client' };

function offered(actions: ReturnType<typeof summaryActions>): string[] {
  const { notes: _notes, ...flags } = actions;
  return Object.entries(flags)
    .filter(([, on]) => on)
    .map(([name]) => name);
}

describe('the review actions a person is offered', () => {
  it('lets the author generate, submit or cancel a draft', () => {
    const actions = summaryActions(
      { status: 'DRAFT', type: 'PROJECT_PROGRESS', ...withText },
      everything,
    );
    expect(offered(actions)).toEqual(['generate', 'submit', 'cancel']);
  });

  it('lets a reviewer approve or send back a summary in review, and nobody else', () => {
    const summary = {
      status: 'IN_REVIEW' as const,
      type: 'PROJECT_PROGRESS' as const,
      ...withText,
    };
    expect(offered(summaryActions(summary, everything))).toEqual([
      'approve',
      'requestChanges',
      'cancel',
    ]);
    expect(offered(summaryActions(summary, { ...everything, canApprove: false }))).toEqual([]);
  });

  it('publishes only a client-facing summary, and only with the client-publish permission', () => {
    const approved = { status: 'APPROVED' as const, ...withText };
    expect(summaryActions({ ...approved, type: 'PROJECT_PROGRESS' }, everything).publish).toBe(
      true,
    );
    expect(summaryActions({ ...approved, type: 'DEVELOPER_DAILY' }, everything).publish).toBe(
      false,
    );
    expect(
      summaryActions(
        { ...approved, type: 'PROJECT_PROGRESS' },
        { ...everything, canPublishToClients: false },
      ).publish,
    ).toBe(false);
  });

  it('offers nothing on a published summary, and no cancel while it generates', () => {
    expect(
      offered(
        summaryActions({ status: 'PUBLISHED', type: 'CLIENT_WEEKLY', ...withText }, everything),
      ),
    ).toEqual([]);
    expect(
      summaryActions({ status: 'GENERATING', type: 'CLIENT_WEEKLY', ...withText }, everything)
        .cancel,
    ).toBe(false);
  });

  it('explains why a draft without text cannot be sent yet', () => {
    const actions = summaryActions(
      { status: 'DRAFT', type: 'LEAD_DAILY', internalContent: null, clientContent: null },
      everything,
    );
    expect(actions.notes).toEqual(['Generate or write the summary before sending it for review.']);
  });
});
