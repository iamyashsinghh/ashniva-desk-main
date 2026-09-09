import './spinner.css';

export interface SpinnerProps {
  /** Announced to screen readers. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Renders the ring alone, with no live region.
   *
   * For a spinner inside something that already announces itself — a button with `aria-busy`, a
   * table with placeholder rows — where a second "Loading" is noise, not information.
   */
  decorative?: boolean;
}

export function Spinner({ label = 'Loading', size = 'md', decorative = false }: SpinnerProps) {
  if (decorative) {
    return (
      <span className={`ui-spinner ui-spinner--${size}`} aria-hidden="true">
        <span className="ui-spinner__ring" />
      </span>
    );
  }
  return (
    <span className={`ui-spinner ui-spinner--${size}`} role="status" aria-live="polite">
      <span className="ui-spinner__ring" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
