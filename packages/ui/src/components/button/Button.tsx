import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shown as a tooltip and read by screen readers to explain why the button is disabled. */
  disabledReason?: string;
  loading?: boolean;
  /** Fills its container. Used in drawers, mobile footers and card actions. */
  fullWidth?: boolean;
  /** A glyph with no text. Requires `aria-label`; the button becomes square. */
  iconOnly?: boolean;
  /** Content before the label, e.g. a count or a glyph. */
  leading?: ReactNode;
  children: ReactNode;
}

/**
 * Standard button. When `disabled` and `disabledReason` are both set, the reason is exposed as a
 * tooltip and as the button's accessible description so users always know why an action is
 * unavailable (an approved design rule: disabled buttons must explain themselves).
 *
 * While `loading`, the label stays rendered and the spinner is added beside it rather than
 * replacing it: swapping the text for a spinner changes the button's width mid-click, which moves
 * whatever is next to it out from under the pointer.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    disabledReason,
    loading = false,
    fullWidth = false,
    iconOnly = false,
    leading,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  const reasonId = useId();
  const isDisabled = disabled || loading;
  const showReason = isDisabled && Boolean(disabledReason);
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? 'ui-button--full' : '',
    iconOnly ? 'ui-button--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      aria-describedby={showReason ? reasonId : undefined}
      title={showReason ? disabledReason : undefined}
      {...rest}
    >
      {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : null}
      {!loading && leading ? (
        <span className="ui-button__leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="ui-button__label">{children}</span>
    </button>
  );

  if (!showReason) {
    return button;
  }

  return (
    <span className={fullWidth ? 'ui-button-with-reason ui-button--full' : 'ui-button-with-reason'}>
      {button}
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </span>
  );
});
