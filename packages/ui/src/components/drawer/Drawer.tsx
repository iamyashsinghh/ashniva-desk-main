import { useEffect, useId, useRef, type ReactNode } from 'react';

import './drawer.css';

export interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Which edge it slides from. `end` (the right) is the default for detail panels. */
  side?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
  /** Footer content, usually the Cancel / primary buttons. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A panel that slides in over the page without leaving it.
 *
 * Built on the native `<dialog>` for the same reason `Modal` is: `showModal()` traps focus, closes
 * on Escape, returns focus to whatever opened it, and marks everything behind it inert — four
 * things a hand-rolled panel gets wrong in four different ways, and the mobile sidebar in the app
 * shell currently gets wrong in three of them.
 *
 * What is left to do by hand is a click on the backdrop. A `<dialog>` fills the viewport, so the
 * backdrop *is* the dialog element, and the press has to be checked against the panel's own box.
 */
export function Drawer({
  open,
  title,
  onClose,
  side = 'end',
  size = 'md',
  footer,
  children,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
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
      className={`ui-drawer ui-drawer--${side} ui-drawer--${size}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape fires `cancel`; letting the browser close the dialog would leave the caller's
        // `open` prop saying it is still there.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
          onClose();
        }
      }}
    >
      <div className="ui-drawer__panel" ref={panelRef}>
        <header className="ui-drawer__header">
          <h2 id={titleId} className="ui-drawer__title">
            {title}
          </h2>
          <button type="button" className="ui-drawer__close" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ui-drawer__body">{children}</div>
        {footer ? <footer className="ui-drawer__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
