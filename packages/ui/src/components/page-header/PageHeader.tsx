import type { ReactNode } from 'react';

import { Breadcrumbs, type BreadcrumbItem } from '../breadcrumbs/Breadcrumbs';

import './page-header.css';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * Breadcrumb-like line above the title, e.g. "Tasks / ACM-12".
   *
   * Kept as a free slot because a dozen detail screens already pass their own markup. New screens
   * should pass `breadcrumbs` instead and get the `nav`/`ol` structure for free.
   */
  crumbs?: ReactNode;
  /** Structured breadcrumbs. Wins over `crumbs` when both are given. */
  breadcrumbs?: BreadcrumbItem[];
  /** Renders breadcrumb links with the app's router link. */
  renderBreadcrumbLink?: (href: string, children: ReactNode) => ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
  /** Filters / view chips under the title. */
  children?: ReactNode;
}

/** Title block at the top of a page (title, subtitle, actions, optional filter row). */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  breadcrumbs,
  renderBreadcrumbLink,
  actions,
  children,
}: PageHeaderProps) {
  const trail = breadcrumbs ? (
    <Breadcrumbs items={breadcrumbs} renderLink={renderBreadcrumbLink} />
  ) : (
    crumbs
  );
  return (
    <div className="ui-page-header">
      <div className="ui-page-header__row">
        <div className="ui-page-header__text">
          {trail ? <div className="ui-page-header__crumbs">{trail}</div> : null}
          <h1 className="ui-page-header__title">{title}</h1>
          {subtitle ? <p className="ui-page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
      </div>
      {children ? <div className="ui-page-header__filters">{children}</div> : null}
    </div>
  );
}
