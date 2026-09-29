/**
 * Reading the `data` block of a notification.
 *
 * A remote push arrives through Apple's or Google's servers and the Expo relay, so everything in
 * it is treated as untrusted input: each field is checked on its own and a bad field is dropped
 * rather than trusted. The shape the API sends is `NativePushData` from `@ashniva/types`; these
 * helpers read it field by field so a payload from a newer API — with a notification type this
 * build has never heard of — still opens its link instead of being thrown away whole.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Far longer than any route the API writes; a link beyond it is not one of ours. */
const MAX_LINK_LENGTH = 512;

const TYPE_SHAPE = /^[A-Z][A-Z0-9_]{0,63}$/;

function field(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  return (data as Record<string, unknown>)[key];
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * An in-app path, or null.
 *
 * Only a same-app absolute path is accepted: `//host` would be read as another origin by anything
 * that ever treats it as a URL, and whitespace or control characters have no business in a route.
 */
export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_LINK_LENGTH) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  return /[\s\u0000-\u001f\u007f\\]/.test(value) ? null : value;
}

/** The server's notification id, used to recognise the same alert arriving twice. */
export function pushNotificationId(data: unknown): string | null {
  const id = field(data, 'notificationId');
  return isUuid(id) ? id : null;
}

/**
 * What makes one alert distinct from another: the notification id plus how many events its row
 * has merged. A grouped row keeps its id, so the second reply on a ticket is a new alert while the
 * same push arriving twice is not. A payload from an older API has no count and reads as the first.
 */
export function alertKey(notificationId: string, groupedCount: number | null): string {
  return `${notificationId}#${groupedCount ?? 1}`;
}

export function pushAlertKey(data: unknown): string | null {
  const id = pushNotificationId(data);
  const count = field(data, 'groupedCount');
  return id ? alertKey(id, isCount(count) ? count : null) : null;
}

export function pushLink(data: unknown): string | null {
  return safeLink(field(data, 'link'));
}

/** The notification type, shape-checked but not matched against this build's list. */
export function pushType(data: unknown): string | null {
  const type = field(data, 'type');
  return typeof type === 'string' && TYPE_SHAPE.test(type) ? type : null;
}

/** What a local alert needs from a `notification.new` event. */
export interface LiveAlert {
  notificationId: string;
  groupedCount: number | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  unreadCount: number | null;
}

/**
 * A realtime `notification.new` payload (`NotificationEvent`), checked before anything shows it.
 *
 * The socket is our own server, but the event is still parsed rather than cast: a malformed one
 * must not put a blank banner on the lock screen or a bad route into the tap payload.
 */
export function parseNotificationEvent(payload: unknown): LiveAlert | null {
  const notification = field(payload, 'notification');
  const notificationId = field(notification, 'id');
  const type = pushType({ type: field(notification, 'type') });
  const title = field(notification, 'title');
  if (!isUuid(notificationId) || !type || typeof title !== 'string' || title.trim() === '') {
    return null;
  }
  const body = field(notification, 'body');
  const entityType = field(notification, 'entityType');
  const entityId = field(notification, 'entityId');
  const unreadCount = field(payload, 'unreadCount');
  const groupedCount = field(notification, 'groupedCount');
  return {
    notificationId,
    groupedCount: isCount(groupedCount) ? groupedCount : null,
    type,
    title,
    body: typeof body === 'string' && body !== '' ? body : null,
    link: safeLink(field(notification, 'link')),
    entityType: typeof entityType === 'string' && entityType.length <= 64 ? entityType : null,
    entityId: isUuid(entityId) ? entityId : null,
    unreadCount: isCount(unreadCount) ? unreadCount : null,
  };
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const PROJECT_LINK = /^\/projects\/([0-9a-f-]{36})$/i;

/**
 * The link to follow for a notification, given its type.
 *
 * The API links every phase-plan notification to `/projects/<id>`, the same path a project
 * notification uses. On the web that page opens on the plan; on the phone the plan lives on the
 * project's summary screen, so the type is what tells the two apart.
 */
export function linkForNotification(link: string | null, type: string | null): string | null {
  const safe = safeLink(link);
  if (!safe || !type?.startsWith('WORK_PLAN_')) {
    return safe;
  }
  const projectId = PROJECT_LINK.exec(safe)?.[1];
  return projectId ? `/projects/${projectId}/summary` : safe;
}
