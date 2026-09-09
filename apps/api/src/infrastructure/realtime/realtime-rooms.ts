/**
 * URL path of the Socket.IO endpoint (engine path, not a namespace): browsers connect to
 * `ws://host/ws/`, which the Vite dev proxy and the nginx image forward to the API as-is.
 */
export const REALTIME_PATH = '/ws';

export function roomForOrganization(organizationId: string): string {
  return `org:${organizationId}`;
}

export function roomForProject(projectId: string): string {
  return `project:${projectId}`;
}

export function roomForUser(userId: string): string {
  return `user:${userId}`;
}

/**
 * A conversation's own room.
 *
 * Joining one is authorized and is refused when it should be, but it is a statement of interest
 * rather than a grant: package 9b delivers conversation events to per-user rooms computed from
 * live project membership, because a room remembers who joined and the point of that package is
 * that yesterday's membership is not today's.
 */
export function roomForConversation(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** Event names sent to browsers and mobile apps. Payload types will live in packages/types. */
export const REALTIME_EVENTS = {
  TASK_UPDATED: 'task.updated',
  TICKET_UPDATED: 'ticket.updated',
  NOTIFICATION_NEW: 'notification.new',
  UPDATE_PUBLISHED: 'update.published',
  CONVERSATION_MESSAGE: 'conversation.message',
  CONVERSATION_MESSAGE_EDITED: 'conversation.message.edited',
  CONVERSATION_MESSAGE_DELETED: 'conversation.message.deleted',
  CONVERSATION_READ: 'conversation.read',
  CONVERSATION_CALL: 'conversation.call',
} as const;
