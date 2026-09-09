import type { HTMLAttributes, ReactNode } from 'react';

import './card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** A line under the title: a count, a total, a qualifier. */
  subtitle?: ReactNode;
  /** Content placed at the right of the title (actions, badges). */
  headerAddon?: ReactNode;
  /** A bar at the bottom of the card, separated from the body. */
  footer?: ReactNode;
  /**
   * The heading level for `title`.
   *
   * A card inside a page section is not a level-2 heading, and a page whose headings jump from h1
   * to h2 eight times in a row has no outline for anyone navigating by heading. Defaults to 2 —
   * what every current caller already renders.
   */
  headingLevel?: 2 | 3 | 4;
  /** `none` for a card whose body is a table or a list that draws its own edges. */
  padding?: 'md' | 'none';
  /** Lifts the card off the page. Use for something floating, not for every card. */
  elevated?: boolean;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  headerAddon,
  footer,
  headingLevel = 2,
  padding = 'md',
  elevated = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    'ui-card',
    `ui-card--pad-${padding}`,
    elevated ? 'ui-card--elevated' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={classes} {...rest}>
      {title || headerAddon ? (
        <header className="ui-card__header">
          <div className="ui-card__heading">
            {title ? <Heading className="ui-card__title">{title}</Heading> : null}
            {subtitle ? <p className="ui-card__subtitle">{subtitle}</p> : null}
          </div>
          {headerAddon ? <div className="ui-card__addon">{headerAddon}</div> : null}
        </header>
      ) : null}
      <div className="ui-card__body">{children}</div>
      {footer ? <footer className="ui-card__footer">{footer}</footer> : null}
    </section>
  );
}
