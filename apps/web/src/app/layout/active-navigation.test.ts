import { ROLE_KEYS } from '@ashniva/types';

import { sessionUserFor } from '../../test/fixtures';
import { activeNavigationTo } from './active-navigation';
import { mobileItems, navigationFor } from './navigation';

const superAdmin = () => navigationFor(sessionUserFor(ROLE_KEYS.SUPER_ADMIN));

/** Resolves a URL the way the shell does, so the tests read like real navigation. */
function activeLabel(url: string, groups = superAdmin()): string | null {
  const [pathname = '', search = ''] = url.split('?');
  const to = activeNavigationTo(groups, pathname, search ? `?${search}` : '');
  const item = groups.flatMap((group) => group.items).find((entry) => entry.to === to);
  return item?.label ?? null;
}

/** Every item the sidebar would mark active for this URL — must never be more than one. */
function activeCount(url: string, groups = superAdmin()): number {
  const [pathname = '', search = ''] = url.split('?');
  const to = activeNavigationTo(groups, pathname, search ? `?${search}` : '');
  return groups.flatMap((group) => group.items).filter((entry) => entry.to === to).length;
}

describe('activeNavigationTo', () => {
  // Regression: "My tasks today", "Tasks" and "Reviews" all point at /tasks, and matching on the
  // pathname alone lit up all three at once.
  it('marks exactly one of the three /tasks items for each task URL', () => {
    expect(activeLabel('/tasks')).toBe('Tasks');
    expect(activeLabel('/tasks?view=today')).toBe('My tasks today');
    expect(activeLabel('/tasks?view=review')).toBe('Reviews');
    for (const url of ['/tasks', '/tasks?view=today', '/tasks?view=review']) {
      expect(activeCount(url)).toBe(1);
    }
  });

  it('falls back to Tasks for a task view that has no sidebar item of its own', () => {
    expect(activeLabel('/tasks?view=all&overdue=true')).toBe('Tasks');
    expect(activeLabel('/tasks?view=team&overdue=true')).toBe('Tasks');
    expect(activeLabel('/tasks?view=my')).toBe('Tasks');
  });

  it('keeps the item active when unrelated parameters are added', () => {
    expect(activeLabel('/tasks?view=today&layout=list')).toBe('My tasks today');
    expect(activeLabel('/tasks?layout=list&view=today')).toBe('My tasks today');
    expect(activeLabel('/tasks?view=review&priority=HIGH')).toBe('Reviews');
    expect(activeLabel('/tasks?layout=list')).toBe('Tasks');
  });

  it('keeps a prefix item active on child routes but not on look-alike paths', () => {
    expect(activeLabel('/tasks/01a07531-c681-7296-b7d8-bc7852622f56')).toBe('Tasks');
    expect(activeLabel('/tasks/new')).toBe('Tasks');
    expect(activeLabel('/tasks-archive')).toBeNull();
  });

  it('is a pure function of the URL, so refresh and back/forward agree with a click', () => {
    // A click, a pasted URL, a reload and a history pop all reach the same pathname + search.
    const urls = ['/tasks?view=today', '/tasks', '/tasks?view=review', '/tasks?view=today'];
    expect(urls.map((url) => activeLabel(url))).toEqual([
      'My tasks today',
      'Tasks',
      'Reviews',
      'My tasks today',
    ]);
  });

  it('separates sibling paths that share a prefix', () => {
    expect(activeLabel('/reports')).toBe('Daily reports');
    expect(activeLabel('/reports/advanced')).toBe('Reports');
    expect(activeCount('/reports/advanced')).toBe(1);
  });

  it('never marks two items for any URL a dashboard card or the menu can reach', () => {
    const urls = [
      '/',
      '/tasks',
      '/tasks?view=today',
      '/tasks?view=review',
      '/tasks?view=all&overdue=true',
      '/tasks?view=team&overdue=true',
      '/tasks?view=all&status=IN_REVIEW',
      '/tickets',
      '/tickets?view=critical',
      '/tickets?view=open',
      '/tickets?view=sla-at-risk',
      '/tickets?view=sla-breached',
      '/projects',
      '/contracts?view=expiring',
      '/approvals?view=waiting-client',
      '/change-requests',
      '/completed-today',
      '/reports',
      '/reports/advanced',
      '/notifications',
      '/admin/users',
      '/admin/roles',
    ];
    for (const url of urls) {
      expect([url, activeCount(url)]).toEqual([url, expect.any(Number)]);
      expect(activeCount(url)).toBeLessThanOrEqual(1);
    }
  });

  it('resolves the client portal menu without overlap', () => {
    const groups = navigationFor(sessionUserFor(ROLE_KEYS.CLIENT_ADMIN, true));
    expect(activeLabel('/portal', groups)).toBe('Overview');
    expect(activeLabel('/portal/projects', groups)).toBe('Projects');
    expect(activeLabel('/portal/projects/abc', groups)).toBe('Projects');
    expect(activeLabel('/portal/contracts/abc', groups)).toBe('Contracts');
  });

  it('lights the section tab on a phone even for a view with its own sidebar item', () => {
    const items = mobileItems(superAdmin());
    expect(activeLabel('/tasks?view=today', [{ items }])).toBe('Tasks');
    expect(activeLabel('/tasks/abc', [{ items }])).toBe('Tasks');
    expect(activeLabel('/', [{ items }])).toBe('Dashboard');
  });
});
