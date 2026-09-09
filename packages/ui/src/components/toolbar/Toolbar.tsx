import type { ReactNode } from 'react';

import './toolbar.css';

export interface ToolbarProps {
  children: ReactNode;
  /**
   * Names the group of controls for a screen reader.
   *
   * When it is given the toolbar becomes a labelled `group`; without it, it stays a plain box.
   * Deliberately not `role="toolbar"`: that role promises arrow-key navigation between the
   * controls, and a filter bar holding selects and a search box does not — and should not — take
   * the arrow keys away from those controls.
   */
  'aria-label'?: string;
  className?: string;
}

/** A row of filters and actions above a list. */
export function Toolbar({ children, className, ...rest }: ToolbarProps) {
  const label = rest['aria-label'];
  return (
    <div
      className={['ui-toolbar', className].filter(Boolean).join(' ')}
      role={label ? 'group' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** Everything after this in a Toolbar sits at the far end of the row. */
export function ToolbarSpacer() {
  return <span className="ui-toolbar__spacer" aria-hidden="true" />;
}

export interface FilterChipProps {
  /** What the filter narrows to, e.g. "Priority: High". Read out with the remove button. */
  label: ReactNode;
  onRemove: () => void;
  /** Overrides the remove button's accessible name; the default names the filter. */
  removeLabel?: string;
}

/**
 * One active filter, with the control that clears it.
 *
 * The task list built these out of ghost buttons whose whole label was `"{filter} ×"`, so a
 * screen reader announced "Priority: High times" and there was nothing to say the button removed
 * anything. Here the text is text and the × is a button that says what it does.
 */
export function FilterChip({ label, onRemove, removeLabel }: FilterChipProps) {
  return (
    <span className="ui-filter-chip">
      <span className="ui-filter-chip__label">{label}</span>
      <button
        type="button"
        className="ui-filter-chip__remove"
        aria-label={removeLabel ?? `Clear filter ${typeof label === 'string' ? label : ''}`.trim()}
        onClick={onRemove}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
