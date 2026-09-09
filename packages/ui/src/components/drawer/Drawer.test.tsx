import { fireEvent, render, screen } from '@testing-library/react';

import { Drawer } from './Drawer';

/**
 * jsdom does not implement <dialog>'s modal behaviour, so `showModal` is stubbed. Everything the
 * browser gives for free — the focus trap, focus restoration, inert background — is exactly what
 * cannot be asserted here; what is testable is the part this component adds on top.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('Drawer', () => {
  it('renders nothing until it is open', () => {
    const { rerender } = render(
      <Drawer open={false} title="Filters" onClose={vi.fn()}>
        Body
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <Drawer open title="Filters" onClose={vi.fn()}>
        Body
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  /**
   * Escape fires `cancel`. Letting the browser close the dialog on its own would leave the
   * caller's `open` prop still saying it is on screen, and the next open would be a no-op.
   */
  it('asks the caller to close on Escape rather than closing itself', () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Filters" onClose={onClose}>
        Body
      </Drawer>,
    );

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a press outside the panel but not inside it', () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Filters" onClose={onClose}>
        <button>Apply</button>
      </Drawer>,
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Apply' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has a close control with a name', () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Filters" onClose={onClose}>
        Body
      </Drawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
