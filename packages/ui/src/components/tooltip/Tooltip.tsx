import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import './tooltip.css';

interface TriggerProps {
  'aria-describedby'?: string;
}

export interface TooltipProps {
  /** The tooltip text. Keep it short: this is a hint, not documentation. */
  content: ReactNode;
  /** A single focusable element — a button, a link, an input. */
  children: ReactElement<TriggerProps>;
  placement?: 'top' | 'bottom';
}

/**
 * A hint attached to a control, reachable by keyboard.
 *
 * The web app has 487 `title` attributes. A native `title` never appears for a keyboard user, never
 * appears on a touch device, takes about a second to show, and cannot be styled or read reliably.
 * This shows on hover *and* on focus, closes on Escape and on blur, and is wired with
 * `aria-describedby` on the trigger itself, so the hint is part of the control's accessible
 * description rather than a separate thing to discover.
 *
 * The bubble is always in the DOM and hidden with `hidden`, so `aria-describedby` resolves at the
 * moment focus lands rather than one render later.
 */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Escape is caught at the document: focus may sit on the trigger, but a tooltip opened by a
    // pointer has focus nowhere near it and still has to be dismissible.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');

  return (
    <span
      className="ui-tooltip"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={close}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={close}
    >
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={`ui-tooltip__bubble ui-tooltip__bubble--${placement}`}
      >
        {content}
      </span>
    </span>
  );
}
