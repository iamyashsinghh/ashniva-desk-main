import { Fragment, type ReactNode } from 'react';

import './breadcrumbs.css';

export interface BreadcrumbItem {
  key: string;
  label: ReactNode;
  /** Omit on the last crumb: the page you are on is not a link to itself. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /**
   * How to render a crumb that has an `href`.
   *
   * `packages/ui` must not depend on the router — a design system that imports react-router
   * cannot be rendered in a gallery, a test, or the mobile app. The app passes its `<Link>`
   * through here; the default is a plain anchor, which does a full page load and is correct
   * outside a router.
   */
  renderLink?: (href: string, children: ReactNode) => ReactNode;
  'aria-label'?: string;
}

/**
 * The trail above a detail page's title.
 *
 * Detail screens were building this by hand inside `PageHeader`'s `crumbs` slot — a link, a
 * literal " / ", and the record's key — which gives a screen reader a run-on line with no
 * structure and no statement of which crumb is the current page. This is a `nav` with an ordered
 * list; the separator is decorative and the last crumb says it is where you are.
 */
export function Breadcrumbs({ items, renderLink, ...rest }: BreadcrumbsProps) {
  const link = renderLink ?? ((href: string, children: ReactNode) => <a href={href}>{children}</a>);
  return (
    <nav className="ui-breadcrumbs" aria-label={rest['aria-label'] ?? 'Breadcrumb'}>
      <ol className="ui-breadcrumbs__list">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? (
              <li className="ui-breadcrumbs__separator" aria-hidden="true">
                /
              </li>
            ) : null}
            <li className="ui-breadcrumbs__item">
              {item.href ? (
                link(item.href, item.label)
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
