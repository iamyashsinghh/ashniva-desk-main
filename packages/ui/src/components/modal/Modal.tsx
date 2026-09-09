import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

import './modal.css';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** A line under the title explaining what the dialog is for. Also its accessible description. */
  description?: ReactNode;
  /** Footer content, usually the Cancel / primary buttons. */
  footer?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether a press on the backdrop closes the dialog.
   *
   * Off by default, and deliberately: these dialogs hold half-typed comments, reasons and work
   * logs, and a stray click outside is not consent to throw that away. Turn it on for a dialog
   * that only shows things.
   */
  dismissOnBackdrop?: boolean;
}

/**
 * Accessible dialog built on the native <dialog> element: focus is trapped by the browser, focus
 * returns to whatever opened it on close, everything behind it is inert, and Escape closes. On
 * phones it becomes a bottom sheet.
 */
export function Modal({
  open,
  title,
  onClose,
  description,
  footer,
  children,
  size = 'md',
  dismissOnBackdrop = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  // Layout, not passive: a <dialog> that is in the DOM but not yet opened is `display: none`, so
  // its whole subtree is invisible and hidden from assistive technology. A passive effect leaves
  // that state observable — for a frame in the browser, and for however long the scheduler takes
  // in tests — which is long enough for a screen reader or a query to miss the dialog's content.
  // Opening it during commit means the closed state is never observable at all.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    /*
     * jsx-a11y reads <dialog> as non-interactive and objects to the pointer handler. A modal
     * <dialog> *is* the backdrop — it fills the viewport and the panel sits inside it — so a press
     * on the empty area has nowhere else to land, and there is no other element to move it to.
     */
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={`ui-modal ui-modal--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape fires `cancel`; letting the browser close it would leave the caller's `open`
        // prop still saying the dialog is on screen.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // The dialog element fills the viewport, so a press on the backdrop lands here. Checking
        // against the panel's box is the only way to tell the two apart. `mousedown` rather than
        // `click`, so a drag that starts inside and ends outside does not close it.
        if (
          dismissOnBackdrop &&
          panelRef.current &&
          !panelRef.current.contains(event.target as Node)
        ) {
          onClose();
        }
      }}
    >
      <div className="ui-modal__panel" ref={panelRef}>
        <header className="ui-modal__header">
          <div className="ui-modal__heading">
            <h2 id={titleId} className="ui-modal__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="ui-modal__description">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="ui-modal__close" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
