import type { ReactNode } from 'react';

import './toast.css';

export interface ToastStackProps {
  /**
   * Names the region for a screen reader, e.g. "New messages".
   *
   * Required rather than optional: an unlabelled live region announces content from nowhere, and
   * a stack that appears in the corner of the screen is exactly the case where "from nowhere" is
   * the difference between useful and baffling.
   */
  'aria-label': string;
  /** Which corner it sits in. Bottom-right is the default, and the only one in use today. */
  position?: 'bottom-end' | 'bottom-start';
  children: ReactNode;
}

/**
 * A corner stack of transient cards.
 *
 * `aria-live="polite"` rather than `assertive`: a message arriving is worth hearing, and worth
 * hearing *after* the sentence somebody is already listening to. `aria-atomic="false"` so only the
 * card that was added is read out, not the two still on screen above it.
 *
 * The region is always in the document, even while empty, because a live region that is inserted
 * at the same moment as its content is not reliably announced — the assistive technology has to
 * have been watching the node before the change.
 */
export function ToastStack({ position = 'bottom-end', children, ...rest }: ToastStackProps) {
  return (
    <div
      className={`ui-toasts ui-toasts--${position}`}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-label={rest['aria-label']}
    >
      {children}
    </div>
  );
}

export interface ToastProps {
  /** The whole card is the action when this is given, so it becomes a button rather than a box. */
  onOpen?: () => void;
  onDismiss: () => void;
  /** Names the dismiss control, e.g. "Dismiss the message from Priya S". */
  dismissLabel: string;
  /** Something small at the leading edge — an avatar, an icon. */
  leading?: ReactNode;
  children: ReactNode;
}

/**
 * One card in a `ToastStack`.
 *
 * The dismiss control is a sibling of the action rather than a child of it: a button inside a
 * button is invalid, and the version where the card is a `<div>` with a click handler is
 * unreachable by keyboard. So the card's body is the button, and the × sits beside it.
 */
export function Toast({ onOpen, onDismiss, dismissLabel, leading, children }: ToastProps) {
  return (
    <div className="ui-toast">
      {onOpen ? (
        <button type="button" className="ui-toast__body" onClick={onOpen}>
          {leading ? <span className="ui-toast__leading">{leading}</span> : null}
          <span className="ui-toast__content">{children}</span>
        </button>
      ) : (
        <div className="ui-toast__body ui-toast__body--static">
          {leading ? <span className="ui-toast__leading">{leading}</span> : null}
          <span className="ui-toast__content">{children}</span>
        </div>
      )}
      <button
        type="button"
        className="ui-toast__dismiss"
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
