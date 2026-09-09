import { fireEvent, render, screen } from '@testing-library/react';

import { Alert } from './Alert';

describe('Alert', () => {
  /**
   * The role is the point of the component. `alert` interrupts a screen reader mid-sentence, which
   * is right for a failure the person just caused and wrong for a confirmation.
   */
  it('interrupts for a failure and waits its turn for a confirmation', () => {
    const { unmount } = render(<Alert tone="danger">Could not save</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    unmount();

    render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('gives the dismiss control a name a keyboard user can act on', () => {
    const onDismiss = vi.fn();
    render(
      <Alert tone="info" dismissLabel="Dismiss the export notice" onDismiss={onDismiss}>
        Export started
      </Alert>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the export notice' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders a title and an action alongside the message', () => {
    render(
      <Alert tone="warning" title="Two projects are at risk" action={<button>Review</button>}>
        Delivery dates have moved.
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Two projects are at risk');
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });
});
