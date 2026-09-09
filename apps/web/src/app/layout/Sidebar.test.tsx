import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { setAuthenticated } from '../../features/auth/session-store';
import { sessionUserFor } from '../../test/fixtures';
import { MobileTabBar } from './MobileTabBar';
import { Sidebar } from './Sidebar';

function renderSidebar(url: string) {
  setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Sidebar onNavigate={() => {}} homePath="/" />
    </MemoryRouter>,
  );
}

/** The labels the sidebar actually marks as the current page. */
function selected(): string[] {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent ?? '');
}

describe('Sidebar active state', () => {
  // Regression: react-router's NavLink matches on the pathname alone and defaults aria-current to
  // "page", so /tasks, /tasks?view=today and /tasks?view=review all marked all three items.
  it('marks exactly one item for each of the three /tasks links', () => {
    for (const [url, label] of [
      ['/tasks', 'Tasks'],
      ['/tasks?view=today', 'My tasks today'],
      ['/tasks?view=review', 'Reviews'],
    ] as const) {
      const view = renderSidebar(url);
      expect(selected()).toEqual([label]);
      view.unmount();
    }
  });

  it('marks only Tasks for a dashboard card link and for a task detail page', () => {
    for (const url of [
      '/tasks?view=all&overdue=true',
      '/tasks?view=team&overdue=true',
      '/tasks/abc',
    ]) {
      const view = renderSidebar(url);
      expect(selected()).toEqual(['Tasks']);
      view.unmount();
    }
  });

  it('marks nothing twice anywhere in the menu', () => {
    for (const url of [
      '/',
      '/tickets?view=critical',
      '/reports',
      '/reports/advanced',
      '/admin/users',
      '/notifications',
    ]) {
      const view = renderSidebar(url);
      expect(selected().length).toBeLessThanOrEqual(1);
      view.unmount();
    }
  });

  it('keeps the phone tab bar on the section tab for a task sub-view', () => {
    setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
    render(
      <MemoryRouter initialEntries={['/tasks?view=today']}>
        <MobileTabBar onMore={() => {}} />
      </MemoryRouter>,
    );
    expect(selected()).toEqual(['Tasks']);
  });
});
