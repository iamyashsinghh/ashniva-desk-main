import { render, screen } from '@testing-library/react';

import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('marks the last crumb as the current page and does not link it', () => {
    render(
      <Breadcrumbs
        items={[
          { key: 'tasks', label: 'Tasks', href: '/tasks' },
          { key: 'current', label: 'ACM-12' },
        ]}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByText('ACM-12')).toHaveAttribute('aria-current', 'page');
  });

  /** packages/ui cannot import the router, so the app hands its link in. */
  it('renders links with the link component the caller supplies', () => {
    render(
      <Breadcrumbs
        items={[{ key: 'tasks', label: 'Tasks', href: '/tasks' }]}
        renderLink={(href, children) => (
          <a data-routed href={href}>
            {children}
          </a>
        )}
      />,
    );
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('data-routed');
  });
});
