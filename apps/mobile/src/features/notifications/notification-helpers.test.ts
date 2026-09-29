import type { NotificationListResponse, NotificationSummary } from '@ashniva/types';
import type { InfiniteData } from '@tanstack/react-query';

import { notificationTypeLabel } from './notification-display';
import { markReadInPages } from './notifications-api';

function row(id: string, readAt: string | null = null): NotificationSummary {
  return {
    id,
    type: 'TASK_ASSIGNED',
    title: `Notification ${id}`,
    body: null,
    link: null,
    entityType: null,
    entityId: null,
    groupedCount: 1,
    readAt,
    createdAt: '2026-09-28T09:00:00.000Z',
  };
}

function pages(
  ...items: NotificationSummary[][]
): InfiniteData<NotificationListResponse, string | null> {
  const unread = items.flat().filter((item) => !item.readAt).length;
  return {
    pages: items.map((page) => ({ items: page, nextCursor: null, unreadCount: unread })),
    pageParams: items.map(() => null),
  };
}

const NOW = '2026-09-28T10:00:00.000Z';

describe('marking read in the cached inbox', () => {
  it('marks one row on whichever page it is and drops the total by one', () => {
    const next = markReadInPages(pages([row('a')], [row('b')]), new Set(['b']), NOW);

    expect(next.pages[1]?.items[0]?.readAt).toBe(NOW);
    expect(next.pages[0]?.items[0]?.readAt).toBeNull();
    expect(next.pages.map((page) => page.unreadCount)).toEqual([1, 1]);
  });

  it('does not count a row that was already read — the total must not go below the truth', () => {
    const next = markReadInPages(
      pages([row('a', '2026-09-27T00:00:00.000Z'), row('b')]),
      new Set(['a']),
      NOW,
    );
    expect(next.pages[0]?.unreadCount).toBe(1);
  });

  it('marks everything for "mark all read"', () => {
    const next = markReadInPages(pages([row('a'), row('b')]), null, NOW);

    expect(next.pages[0]?.items.every((item) => item.readAt === NOW)).toBe(true);
    expect(next.pages[0]?.unreadCount).toBe(0);
  });
});

describe('notification type labels', () => {
  it('uses the wording the web and the preferences screen use', () => {
    expect(notificationTypeLabel('WORK_PLAN_ASSIGNED')).toBe(
      'Work on a phase plan was assigned to me',
    );
  });

  it('turns a type this build does not know into words rather than a constant', () => {
    expect(notificationTypeLabel('SOMETHING_NEW_HAPPENED')).toBe('Something new happened');
  });
});
