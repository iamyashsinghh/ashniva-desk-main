import type { ReactNode } from 'react';

import './empty-state.css';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Usually a Button that performs the primary action. */
  action?: ReactNode;
  /**
   * A glyph above the title. Always decorative — the title says what is going on, so a described
   * icon would say it twice.
   */
  icon?: ReactNode;
  /** `sm` for an empty state inside a card or a table cell rather than a whole page. */
  size?: 'sm' | 'md';
}

export function EmptyState({ title, description, action, icon, size = 'md' }: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ui-empty-state--${size}`}>
      {icon ? (
        <span className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="ui-empty-state__title">{title}</p>
      {description ? <div className="ui-empty-state__description">{description}</div> : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </div>
  );
}
