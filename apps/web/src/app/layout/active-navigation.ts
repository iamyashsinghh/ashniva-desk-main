import type { NavigationGroup, NavigationItem } from './navigation';

/**
 * Which sidebar / tab-bar item the current URL belongs to.
 *
 * Several items share a pathname and differ only by query string (all of "My tasks today",
 * "Tasks" and "Reviews" point at /tasks), so a pathname-only match — which is what react-router's
 * NavLink does — lights up all of them at once. Matching is therefore done here, over the whole
 * menu at once, and exactly one item can win.
 */
export function activeNavigationTo(
  groups: NavigationGroup[],
  pathname: string,
  search: string,
): string | null {
  const current = new URLSearchParams(search);
  let best: { to: string; params: number; length: number } | null = null;

  for (const group of groups) {
    for (const item of group.items) {
      if (item.unavailable) {
        continue;
      }
      const score = matchScore(item, pathname, current);
      if (!score) {
        continue;
      }
      // The most specific match wins: more query parameters first, then the longer path.
      const better =
        !best ||
        score.params > best.params ||
        (score.params === best.params && score.length > best.length);
      if (better) {
        best = { to: item.to, ...score };
      }
    }
  }
  return best?.to ?? null;
}

interface MatchScore {
  params: number;
  length: number;
}

/** null when the item does not match; otherwise how specific the match is. */
function matchScore(
  item: NavigationItem,
  pathname: string,
  current: URLSearchParams,
): MatchScore | null {
  const [path = '', search = ''] = item.to.split('?');
  if (!pathMatches(path, pathname, item.prefix ?? false)) {
    return null;
  }
  const wanted = [...new URLSearchParams(search)];
  for (const [key, value] of wanted) {
    if (current.get(key) !== value) {
      return null;
    }
  }
  return { params: wanted.length, length: path.length };
}

/** Prefix items match child routes, but only on a path boundary (/tasks never matches /tasks-x). */
function pathMatches(path: string, pathname: string, prefix: boolean): boolean {
  if (pathname === path) {
    return true;
  }
  return prefix && pathname.startsWith(path.endsWith('/') ? path : `${path}/`);
}
