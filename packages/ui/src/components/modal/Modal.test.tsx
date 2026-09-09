import { fireEvent, render, screen } from '@testing-library/react';

import { Modal } from './Modal';

/** jsdom does not implement <dialog>'s modal behaviour; only what this component adds is testable. */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('Modal', () => {
  it('is named by its title and described by its description', () => {
    render(
      <Modal open title="Submit for review" description="Your reviewer sees this" onClose={vi.fn()}>
        Body
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Submit for review' });
    expect(dialog).toHaveAccessibleDescription('Your reviewer sees this');
  });

  it('asks the caller to close on Escape rather than closing itself', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Submit" onClose={onClose}>
        Body
      </Modal>,
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * These dialogs hold half-typed comments, reasons and work logs. A stray click outside is not
   * consent to throw that away, so dismissing on the backdrop is opt-in.
   */
  it('ignores a backdrop press unless the caller asked for it', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open title="Submit" onClose={onClose}>
        Body
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Modal open title="Submit" onClose={onClose} dismissOnBackdrop>
        Body
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
