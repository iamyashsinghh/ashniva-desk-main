import {
  linkForNotification,
  parseNotificationEvent,
  pushAlertKey,
  pushLink,
  pushNotificationId,
  pushType,
  safeLink,
} from './notification-payload';

/**
 * Reading a push payload. Everything in one came through servers we do not run, so each field is
 * checked alone and a bad one is dropped rather than trusted.
 */

const ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';
const OTHER = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f61';

describe('safeLink', () => {
  it('accepts an in-app path, query string included', () => {
    expect(safeLink(`/tickets/${ID}`)).toBe(`/tickets/${ID}`);
    expect(safeLink('/tasks?status=OVERDUE')).toBe('/tasks?status=OVERDUE');
  });

  it('refuses anything that could be read as another origin or is not a path at all', () => {
    for (const value of [
      'https://evil.example/x',
      '//evil.example/x',
      'javascript:alert(1)',
      'tickets/1',
      '/tickets/\n1',
      '/a\\b',
      `/${'a'.repeat(600)}`,
      42,
      null,
    ]) {
      expect(safeLink(value)).toBeNull();
    }
  });
});

describe('the fields of a native push', () => {
  it('reads the ones the API sends', () => {
    const data = { notificationId: ID, type: 'TASK_ASSIGNED', link: `/tasks/${ID}` };
    expect(pushNotificationId(data)).toBe(ID);
    expect(pushType(data)).toBe('TASK_ASSIGNED');
    expect(pushLink(data)).toBe(`/tasks/${ID}`);
  });

  it('drops a malformed field without losing the others', () => {
    const data = { notificationId: '1 OR 1=1', type: 'task assigned', link: `/tasks/${ID}` };
    expect(pushNotificationId(data)).toBeNull();
    expect(pushType(data)).toBeNull();
    expect(pushLink(data)).toBe(`/tasks/${ID}`);
  });

  it('keeps a type this build has never heard of, so a newer API still routes', () => {
    expect(pushType({ type: 'SOMETHING_NEW' })).toBe('SOMETHING_NEW');
  });

  it('tells a later event merged into a grouped notification apart from the first', () => {
    expect(pushAlertKey({ notificationId: ID, groupedCount: 3 })).toBe(`${ID}#3`);
    expect(pushAlertKey({ notificationId: ID })).toBe(`${ID}#1`);
    expect(pushAlertKey({ notificationId: ID, groupedCount: -1 })).toBe(`${ID}#1`);
    expect(pushAlertKey({ notificationId: 'nope', groupedCount: 3 })).toBeNull();
  });

  it('reads nothing from something that is not an object', () => {
    for (const data of [null, undefined, 'x', 3]) {
      expect(pushNotificationId(data)).toBeNull();
      expect(pushLink(data)).toBeNull();
    }
  });
});

describe('linkForNotification', () => {
  it('sends a phase-plan alert to the project summary, where the plan lives on the phone', () => {
    expect(linkForNotification(`/projects/${ID}`, 'WORK_PLAN_ASSIGNED')).toBe(
      `/projects/${ID}/summary`,
    );
  });

  it('leaves a project alert of another kind on the project', () => {
    expect(linkForNotification(`/projects/${ID}`, 'PROJECT_MEMBER_ADDED')).toBe(`/projects/${ID}`);
    expect(linkForNotification(`/projects/${ID}`, null)).toBe(`/projects/${ID}`);
  });

  it('never returns a link it would not accept on its own', () => {
    expect(linkForNotification('//evil.example', 'WORK_PLAN_ASSIGNED')).toBeNull();
    expect(linkForNotification(null, 'WORK_PLAN_ASSIGNED')).toBeNull();
  });
});

describe('parseNotificationEvent', () => {
  const event = {
    notification: {
      id: ID,
      type: 'TICKET_ASSIGNED',
      title: 'A ticket is yours',
      body: 'TCK-12 was assigned to you',
      link: `/tickets/${OTHER}`,
      entityType: 'ticket',
      entityId: OTHER,
      groupedCount: 1,
      readAt: null,
      createdAt: '2026-09-28T09:00:00.000Z',
    },
    unreadCount: 4,
  };

  it('reads what a local alert needs', () => {
    expect(parseNotificationEvent(event)).toEqual({
      notificationId: ID,
      groupedCount: 1,
      type: 'TICKET_ASSIGNED',
      title: 'A ticket is yours',
      body: 'TCK-12 was assigned to you',
      link: `/tickets/${OTHER}`,
      entityType: 'ticket',
      entityId: OTHER,
      unreadCount: 4,
    });
  });

  it('refuses an event with no usable id or title — a blank banner is worse than none', () => {
    expect(
      parseNotificationEvent({ ...event, notification: { ...event.notification, id: 'x' } }),
    ).toBeNull();
    expect(
      parseNotificationEvent({ ...event, notification: { ...event.notification, title: '  ' } }),
    ).toBeNull();
    expect(parseNotificationEvent(null)).toBeNull();
  });

  it('drops a bad link and a bad count but keeps the alert', () => {
    const parsed = parseNotificationEvent({
      notification: { ...event.notification, link: 'https://evil.example' },
      unreadCount: -1,
    });
    expect(parsed?.link).toBeNull();
    expect(parsed?.unreadCount).toBeNull();
    expect(parsed?.title).toBe('A ticket is yours');
  });
});
