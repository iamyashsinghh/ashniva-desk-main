import { render, screen } from '@testing-library/react';

import { WorkflowActions, type ActionSpec } from './WorkflowActions';

type Action = 'approve' | 'reject' | 'publish';

const SPECS: ActionSpec<Action>[] = [
  { action: 'publish', label: 'Publish', variant: 'primary' },
  { action: 'approve', label: 'Approve', variant: 'accent' },
  { action: 'reject', label: 'Reject', variant: 'danger' },
];

describe('WorkflowActions', () => {
  it('obeys the API: enabled buttons work, role-blocked ones stay visible and explain why', () => {
    render(
      <WorkflowActions
        availability={[
          { action: 'publish', enabled: true },
          { action: 'approve', enabled: false, reason: 'Only the client approves' },
        ]}
        specs={SPECS}
        onAction={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription('Only the client approves');
  });

  it('hides actions the current status rules out', () => {
    render(
      <WorkflowActions
        availability={[
          { action: 'publish', enabled: true },
          { action: 'reject', enabled: false, reason: 'Not available while the request is draft' },
        ]}
        specs={SPECS}
        onAction={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('explains when there is nothing to do', () => {
    render(
      <WorkflowActions
        availability={[]}
        specs={SPECS}
        onAction={() => undefined}
        emptyHint="Waiting for the client."
      />,
    );
    expect(screen.getByText('Waiting for the client.')).toBeInTheDocument();
  });
});
