import { type ReactNode } from 'react';

import type { Tone } from '../../tokens/status-tone';

import './alert.css';

export interface AlertProps {
  /** Reuses the status tones, so a failed action looks like a failed status. */
  tone?: Tone;
  /** Bold first line. Omit for a one-line message. */
  title?: ReactNode;
  children?: ReactNode;
  /** A button or link, e.g. "Try again". */
  action?: ReactNode;
  /** Renders a close button. The caller owns the dismissed state. */
  onDismiss?: () => void;
  /** Label for the close button; say what is being dismissed when several are on screen. */
  dismissLabel?: string;
  className?: string;
}

/**
 * The inline message every form and panel in this product already shows by hand.
 *
 * There were 121 hand-written `<p className="form-error" role="alert">` blocks across the web app
 * and the class they use is declared in `features/tasks/tasks.css` — which eight unrelated
 * features import purely to get it. This is that block, with the two things the hand-written
 * version kept getting wrong: the live-region role matching the severity, and a dismissible
 * message having a button somebody can reach with a keyboard.
 *
 * `role="alert"` interrupts a screen reader mid-sentence. That is right for a failure the person
 * just caused and wrong for a "saved" confirmation, so the role follows the tone rather than
 * being the same for every message.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
}: AlertProps) {
  const assertive = tone === 'danger' || tone === 'warning';
  const classes = ['ui-alert', `ui-tone--${tone}`, className].filter(Boolean).join(' ');
  return (
    <div className={classes} role={assertive ? 'alert' : 'status'}>
      <div className="ui-alert__content">
        {title ? <p className="ui-alert__title">{title}</p> : null}
        {children ? <div className="ui-alert__body">{children}</div> : null}
      </div>
      {action ? <div className="ui-alert__action">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="ui-alert__dismiss"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
