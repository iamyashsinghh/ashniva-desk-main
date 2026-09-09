import type { ReactNode } from 'react';

import './description-list.css';

export interface DescriptionItem {
  /** Stable key. The term is usually fine. */
  key: string;
  term: ReactNode;
  description: ReactNode;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /**
   * `rows` puts the term beside its value and is the dense default used by every detail panel.
   * `stacked` puts it above, which is what a narrow column or a phone needs.
   */
  layout?: 'rows' | 'stacked';
  className?: string;
}

/**
 * The label-and-value panel on every detail screen.
 *
 * Thirty-two hand-written `<dl className="kv">` blocks across eight features, all styled by a
 * class declared in `features/tasks/tasks.css`. Taking the array instead of children is what
 * makes the responsive behaviour possible at all: a `<dl>` whose `<dt>`/`<dd>` pairs are written
 * out by hand cannot be re-laid-out from rows to stacked without the caller's cooperation, and
 * every caller was doing it differently.
 */
export function DescriptionList({ items, layout = 'rows', className }: DescriptionListProps) {
  const classes = ['ui-dl', `ui-dl--${layout}`, className].filter(Boolean).join(' ');
  return (
    <dl className={classes}>
      {items.map((item) => (
        <div className="ui-dl__pair" key={item.key}>
          <dt className="ui-dl__term">{item.term}</dt>
          <dd className="ui-dl__description">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
